import { ConstraintType, EntityType, type Graph } from 'falkordb'
import northstar from '../../fixtures/northstar.json'
import {
  accountCaseSchema, agentSchema, artifactSchema, artifactWriteSchema, assessmentSchema,
  changeSchema, edgeSchema, jsonSchema, policyFactsSchema, repairReportSchema, replyDraftSchema,
  returnCaseSchema, runSchema, sessionSchema, sourceBodySchema, stepSchema, workspaceSnapshotSchema,
  type Artifact, type ArtifactWrite, type ImpactReport, type WorkspaceSnapshot,
} from '../../shared/contracts'
import { DomainError, hashCanonical, validateLineage, validatePolicyFacts } from '../domain'
import type { Env } from '../env'
import { withGraph } from './client'
import { queries, readOnlyQueries, type QueryName, type QueryParams } from './queries'

const labels = ['Workspace', 'Artifact', 'Session', 'Agent', 'Run', 'Step', 'Change', 'RepairReport']
type Properties = Record<string, unknown>

export async function queryGraph<T>(env: Env, graphName: string, query: QueryName, params: QueryParams = {}): Promise<T[]> {
  return withGraph(env, graphName, async (graph) => {
    const options = { params, TIMEOUT: 2_000 }
    const reply = readOnlyQueries.has(query)
      ? await graph.roQuery<T>(queries[query], options)
      : await graph.query<T>(queries[query], options)
    return reply.data ?? []
  })
}

interface ConstraintRow { type: string; label: string; properties: string[]; status: string }
interface IndexRow { label: string; properties: string[]; status: string }

async function ignoreExisting(work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    if (!(error instanceof Error) || !/already exists|already indexed|equivalent index/i.test(error.message)) throw error
  }
}

async function schemaRows(graph: Graph) {
  const constraints = (await graph.roQuery<ConstraintRow>('CALL db.constraints()', { TIMEOUT: 2_000 })).data ?? []
  const indexes = (await graph.roQuery<IndexRow>('CALL db.indexes()', { TIMEOUT: 2_000 })).data ?? []
  return { constraints, indexes }
}

export async function ensureSchema(env: Env, graphName: string): Promise<void> {
  const unique = [...[...labels, 'Quota', 'WorkspaceRegistry'].map((label) => [label, 'id'] as const), ['Artifact', 'currentKey'] as const]
  const indexed = [...unique, ['Artifact', 'logicalId'] as const, ['Run', 'status'] as const]
  await withGraph(env, graphName, async (graph) => {
    await graph.query('MERGE (s:Schema {id: $id}) ON CREATE SET s.version = 1', { params: { id: 'undograph' }, TIMEOUT: 2_000 })
    const initial = await schemaRows(graph)
    for (const [label, property] of indexed) {
      if (!initial.indexes.some((row) => row.label === label && row.properties.includes(property))) {
        await ignoreExisting(() => graph.createNodeRangeIndex(label, property))
      }
    }
    for (const [label, property] of unique) {
      if (!initial.constraints.some((row) => row.type === 'UNIQUE' && row.label === label && row.properties.length === 1 && row.properties[0] === property)) {
        await ignoreExisting(() => graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, label, property))
      }
    }
    const deadline = Date.now() + 5_000
    while (true) {
      const current = await schemaRows(graph)
      if (current.constraints.some((row) => row.status === 'FAILED')) throw new DomainError('SCHEMA_UNAVAILABLE', 'A required graph constraint failed.', 503)
      if (
        unique.every(([label, property]) => current.constraints.some((row) => row.type === 'UNIQUE' && row.label === label && row.properties[0] === property && row.status === 'OPERATIONAL')) &&
        indexed.every(([label, property]) => current.indexes.some((row) => row.label === label && row.properties.includes(property) && row.status === 'OPERATIONAL'))
      ) return
      if (Date.now() >= deadline) throw new DomainError('SCHEMA_UNAVAILABLE', 'Required graph constraints are not ready.', 503)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  })
}

function parseStoredJson(value: unknown): unknown {
  if (typeof value !== 'string') throw new DomainError('INCOMPLETE_AUDIT', 'A stored artifact is missing its immutable content.')
  try {
    return JSON.parse(value)
  } catch {
    throw new DomainError('INCOMPLETE_AUDIT', 'Stored artifact content is invalid; this audit is incomplete.')
  }
}

function decodeArtifact(properties: Properties): Artifact {
  return artifactSchema.parse({ ...properties, body: parseStoredJson(properties.bodyJson), inputIds: parseStoredJson(properties.inputIdsJson) })
}

interface SnapshotRow { labels: string[]; node: Properties; relation: string | null; targetId: string | null }

export async function loadSnapshot(env: Env, graphName: string): Promise<WorkspaceSnapshot> {
  const rows = await queryGraph<SnapshotRow>(env, graphName, 'snapshot')
  const groups = new Map<string, Map<string, Properties>>()
  const edges = new Map<string, { from: string; to: string; type: string }>()
  for (const row of rows) {
    const label = row.labels.find((value) => labels.includes(value))
    if (!label) continue
    if (typeof row.node.id !== 'string') throw new DomainError('INCOMPLETE_AUDIT', 'A graph record has no stable ID.')
    const group = groups.get(label) ?? new Map<string, Properties>()
    group.set(row.node.id, row.node)
    groups.set(label, group)
    if (row.relation && row.targetId) {
      const edge = { from: row.node.id, to: row.targetId, type: row.relation }
      edges.set(JSON.stringify(edge), edge)
    }
  }
  const nodes = (label: string) => [...(groups.get(label)?.values() ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const workspaces = nodes('Workspace')
  if (!workspaces.length) throw new DomainError('NOT_FOUND', 'Workspace not found.', 404)
  if (workspaces.length !== 1) throw new DomainError('INCOMPLETE_AUDIT', 'Conflicting workspace roots make this audit incomplete.')
  const snapshot = workspaceSnapshotSchema.parse({
    workspace: workspaces[0],
    artifacts: nodes('Artifact').map(decodeArtifact),
    sessions: nodes('Session').map((node) => sessionSchema.parse(node)),
    agents: nodes('Agent').map((node) => agentSchema.parse(node)),
    runs: nodes('Run').map((node) => runSchema.parse(node)),
    steps: nodes('Step').map((node) => stepSchema.parse(node)),
    changes: nodes('Change').map((node) => changeSchema.parse(node)),
    reports: nodes('RepairReport').map((node) => repairReportSchema.parse({
      ...node, repairedLogicalIds: parseStoredJson(node.repairedLogicalIdsJson), preserved: parseStoredJson(node.preservedJson),
    })),
    edges: [...edges.values()].map((edge) => edgeSchema.parse(edge)),
  })
  if (snapshot.workspace.expiresAt <= Date.now()) throw new DomainError('WORKSPACE_EXPIRED', 'Workspace expired. Create a fresh workspace to continue.', 404)
  return snapshot
}

export async function initializeWorkspace(env: Env, graphName: string, workspaceId: string, expiresAt: number): Promise<WorkspaceSnapshot> {
  await ensureSchema(env, graphName)
  const rows = await queryGraph<{ workspace: Properties }>(env, graphName, 'bootstrapWorkspace', { id: workspaceId, createdAt: Date.now(), expiresAt })
  if (!rows.length) throw new DomainError('NOT_FOUND', 'Workspace not found.', 404)
  if (rows[0].workspace.initialized === true) return loadSnapshot(env, graphName)
  for (const source of northstar.sources) {
    await recordArtifact(env, graphName, { ...source, kind: 'source', inputIds: [], expectedRevision: 0, stage: 'seed', promptVersion: 'v1' })
  }
  for (const ticket of northstar.cases) {
    await recordArtifact(env, graphName, { ...ticket, body: jsonSchema.parse(ticket.body), kind: 'case', inputIds: [], expectedRevision: 0, stage: 'seed', promptVersion: 'v1' })
  }
  for (const definition of northstar.agents) {
    const agent = agentSchema.parse(definition)
    await queryGraph(env, graphName, 'seedAgent', agent)
  }
  await queryGraph(env, graphName, 'finishInitialization', { id: workspaceId })
  return loadSnapshot(env, graphName)
}

const bodySchemas = {
  source: sourceBodySchema,
  case: returnCaseSchema.or(accountCaseSchema),
  'policy-facts': policyFactsSchema,
  assessment: assessmentSchema,
  reply: replyDraftSchema,
}

export async function recordArtifact(env: Env, graphName: string, write: ArtifactWrite): Promise<Artifact> {
  const input = artifactWriteSchema.parse(write)
  const body = jsonSchema.parse(bodySchemas[input.kind].parse(input.body))
  const snapshot = await loadSnapshot(env, graphName)
  const depths = validateLineage(snapshot)
  if (snapshot.workspace.revision !== input.expectedRevision) throw new DomainError('REVISION_CONFLICT', 'The source revision changed. Refresh before writing work.')
  if (new Set(input.inputIds).size !== input.inputIds.length || input.inputIds.includes(input.id)) {
    throw new DomainError('INVALID_DEPENDENCY', 'Each recorded input must name a distinct existing artifact version.', 422)
  }
  const contentHash = await hashCanonical({ kind: input.kind, body })
  const dependencyHash = await hashCanonical({ inputs: input.inputIds, stage: input.stage, promptVersion: input.promptVersion })
  const existing = snapshot.artifacts.find((artifact) => artifact.id === input.id)
  if (existing) {
    if (existing.logicalId !== input.logicalId || existing.kind !== input.kind || existing.contentHash !== contentHash || existing.dependencyHash !== dependencyHash) {
      throw new DomainError('ARTIFACT_CONFLICT', 'An immutable artifact version cannot be rewritten.')
    }
    return existing
  }
  if (snapshot.artifacts.length >= 250) throw new DomainError('ARTIFACT_LIMIT', 'This workspace reached its 250-version limit. Export or reset it before continuing.', 429)
  if (input.status === 'current' && snapshot.artifacts.some((artifact) => artifact.logicalId === input.logicalId && artifact.isCurrent)) {
    throw new DomainError('CURRENT_VERSION_CONFLICT', 'Use guarded promotion to replace a current artifact version.')
  }
  const parents = input.inputIds.map((id) => {
    const parent = snapshot.artifacts.find((artifact) => artifact.id === id)
    if (!parent) throw new DomainError('NOT_FOUND', 'An input artifact version was not found.', 404)
    if (!((parent.isCurrent && !parent.needsReview && ['current', 'released'].includes(parent.status)) ||
      (input.status === 'candidate' && input.runId && parent.status === 'candidate' && parent.runId === input.runId))) {
      throw new DomainError('STALE_INPUT', 'Work cannot be created from a stale or unpublished input.')
    }
    return parent
  })
  const depth = parents.length ? 1 + Math.max(...parents.map((parent) => depths.get(parent.id) ?? 0)) : 0
  if (depth > 12) throw new DomainError('INCOMPLETE_AUDIT', 'Dependency depth would exceed 12; this audit is incomplete.')
  if (['source', 'case'].includes(input.kind) && parents.length) throw new DomainError('INVALID_DEPENDENCY', 'Source and case inputs must be explicit root artifacts.', 422)
  if (input.kind === 'policy-facts') {
    const facts = policyFactsSchema.parse(body)
    const source = parents.find((parent) => parent.id === facts.sourceArtifactId)
    if (!source) throw new DomainError('INVALID_EVIDENCE', 'Policy evidence must come from a recorded input.', 422)
    validatePolicyFacts(facts, source)
  }
  if (input.kind === 'assessment') {
    const assessment = assessmentSchema.parse(body)
    if (!parents.some((parent) => parent.id === assessment.caseArtifactId && parent.kind === 'case') || !parents.some((parent) => parent.id === assessment.factsArtifactId && parent.kind === 'policy-facts')) {
      throw new DomainError('INVALID_DEPENDENCY', 'Assessment references must match its recorded case and policy-facts inputs.', 422)
    }
  }
  if (input.kind === 'reply') {
    const reply = replyDraftSchema.parse(body)
    if (reply.citations.some((id) => !input.inputIds.includes(id)) ||
      (reply.assessmentArtifactId && !parents.some((parent) => parent.id === reply.assessmentArtifactId && parent.kind === 'assessment')) ||
      (reply.sourceArtifactId && !parents.some((parent) => parent.id === reply.sourceArtifactId && parent.kind === 'source')) ||
      (!reply.assessmentArtifactId && !reply.sourceArtifactId)) {
      throw new DomainError('INVALID_EVIDENCE', 'Reply references must come from its recorded inputs.', 422)
    }
  }
  if (input.supersedesId) {
    const previous = snapshot.artifacts.find((artifact) => artifact.id === input.supersedesId)
    if (!previous || previous.logicalId !== input.logicalId || previous.kind !== input.kind || !previous.isCurrent) {
      throw new DomainError('ARTIFACT_CONFLICT', 'A replacement must name the current version of the same artifact.')
    }
  }
  const rows = await queryGraph<{ artifact: Properties }>(env, graphName, 'recordArtifact', {
    id: input.id, logicalId: input.logicalId, kind: input.kind, bodyJson: JSON.stringify(body),
    contentHash, dependencyHash, inputIds: input.inputIds, inputIdsJson: JSON.stringify(input.inputIds),
    expectedRevision: input.expectedRevision, depth, status: input.status, isCurrent: input.status === 'current',
    needsReview: (input.kind === 'policy-facts' && policyFactsSchema.parse(body).status === 'needs-review') ||
      (input.kind === 'assessment' && assessmentSchema.parse(body).decision === 'needs-review') ||
      (input.kind === 'reply' && replyDraftSchema.parse(body).decision === 'needs-review'),
    createdAt: Date.now(), stage: input.stage, promptVersion: input.promptVersion,
    runId: input.runId ?? null, stepId: input.stepId ?? null, sessionId: input.sessionId ?? null, supersedesId: input.supersedesId ?? null,
  })
  if (!rows.length) {
    const latest = await loadSnapshot(env, graphName)
    if (latest.workspace.revision !== input.expectedRevision) throw new DomainError('REVISION_CONFLICT', 'The source revision changed while saving work.')
    throw new DomainError('ARTIFACT_CONFLICT', 'An input or current-version pointer changed while saving work. Refresh and retry.')
  }
  return decodeArtifact(rows[0].artifact)
}

interface ImpactRow { revision: number; artifact: Properties | null; path: string[] }

export async function findImpact(env: Env, graphName: string, sourceId: string): Promise<ImpactReport> {
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  if (!snapshot.artifacts.some((artifact) => artifact.id === sourceId)) throw new DomainError('NOT_FOUND', 'Artifact version not found.', 404)
  const rows = await queryGraph<ImpactRow>(env, graphName, 'impact', {
    sourceId, expectedRevision: snapshot.workspace.revision, artifactCount: snapshot.artifacts.length,
  })
  if (!rows.length) throw new DomainError('REVISION_CONFLICT', 'Work changed during the impact query. Refresh and retry.')
  // ponytail: explanations are capped at 1,024 paths; raise only with a larger response budget.
  if (rows.length > 1_024) throw new DomainError('INCOMPLETE_AUDIT', 'Too many explanation paths; this audit is incomplete.')
  const affected = new Map<string, Artifact>()
  const paths = new Map<string, string[]>()
  for (const row of rows) {
    if (row.artifact) {
      const artifact = decodeArtifact(row.artifact)
      affected.set(artifact.id, artifact)
    }
    if (row.path.length) {
      const path = [...row.path].reverse()
      paths.set(JSON.stringify(path), path)
    }
  }
  return {
    sourceArtifactId: sourceId, revision: snapshot.workspace.revision, complete: true,
    affected: [...affected.values()].sort((a, b) => a.id.localeCompare(b.id)),
    paths: [...paths.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}
