import type { Assessment, Artifact, ImpactReport, PolicyFacts, RepairPlan, ReturnCase, WorkspaceSnapshot } from '../shared/contracts'
import { policyFactsSchema, returnCaseSchema, sourceBodySchema } from '../shared/contracts'

export class DomainError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 409) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.status = status
  }
}

export async function hashCanonical(value: unknown): Promise<string> {
  const ancestors = new Set<object>()
  function serialize(item: unknown): string {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item)
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item)
    if (typeof item !== 'object' || ancestors.has(item)) throw new TypeError('Expected acyclic JSON data.')
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new TypeError('Expected plain JSON data.')
    }
    ancestors.add(item)
    try {
      if (Array.isArray(item)) return `[${item.map(serialize).join(',')}]`
      const object = item as Record<string, unknown>
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${serialize(object[key])}`).join(',')}}`
    } finally {
      ancestors.delete(item)
    }
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(value)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assessReturn(
  ticket: ReturnCase,
  facts: PolicyFacts,
  references: { caseArtifactId: string; factsArtifactId: string },
): Assessment {
  const validatedCase = returnCaseSchema.parse(ticket)
  const validatedFacts = policyFactsSchema.parse(facts)
  if (validatedFacts.status === 'needs-review') {
    return { ...references, decision: 'needs-review', explanation: `Policy evidence requires review: ${validatedFacts.reason}` }
  }
  return {
    ...references,
    decision: validatedCase.daysSinceDelivery <= validatedFacts.returnWindowDays ? 'eligible' : 'ineligible',
    explanation: `${validatedCase.daysSinceDelivery} days since delivery; the supported return window is ${validatedFacts.returnWindowDays} days.`,
  }
}

export function validatePolicyFacts(facts: PolicyFacts, source: Artifact): PolicyFacts {
  const validated = policyFactsSchema.parse(facts)
  if (source.kind !== 'source' || validated.sourceArtifactId !== source.id) {
    throw new DomainError('INVALID_EVIDENCE', 'Policy facts must cite the exact supplied source version.', 422)
  }
  if (validated.status === 'needs-review') return validated
  const body = sourceBodySchema.parse(source.body)
  const statements = [...body.text.matchAll(/Change-of-mind returns are accepted within (\d+) days of delivery\./g)]
  if (
    body.category !== 'return-policy' || statements.length !== 1 ||
    Number(statements[0][1]) !== validated.returnWindowDays ||
    body.text.slice(validated.evidenceStart, validated.evidenceEnd) !== validated.evidenceQuote ||
    !validated.evidenceQuote.includes(statements[0][0])
  ) {
    throw new DomainError('INVALID_EVIDENCE', 'The quoted evidence does not support an unambiguous return window.', 422)
  }
  return validated
}

export function validateLineage(snapshot: WorkspaceSnapshot): Map<string, number> {
  if (snapshot.artifacts.length > 250) throw new DomainError('INCOMPLETE_AUDIT', 'Artifact limit exceeded; this audit is incomplete.')
  const artifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact]))
  if (artifacts.size !== snapshot.artifacts.length) throw new DomainError('INCOMPLETE_AUDIT', 'Duplicate artifact IDs make this audit incomplete.')
  const dependencies = new Map<string, Set<string>>()
  for (const edge of snapshot.edges.filter((edge) => edge.type === 'DEPENDS_ON')) {
    if (!artifacts.has(edge.from) || !artifacts.has(edge.to)) {
      throw new DomainError('INCOMPLETE_AUDIT', 'A recorded dependency is missing; this audit is incomplete.')
    }
    const inputs = dependencies.get(edge.from) ?? new Set<string>()
    inputs.add(edge.to)
    dependencies.set(edge.from, inputs)
  }
  const currentLogicalIds = new Set<string>()
  for (const artifact of snapshot.artifacts) {
    const inputs = dependencies.get(artifact.id) ?? new Set<string>()
    if (inputs.size !== artifact.inputIds.length || artifact.inputIds.some((input) => !inputs.has(input))) {
      throw new DomainError('INCOMPLETE_AUDIT', 'Artifact inputs disagree with recorded graph edges; this audit is incomplete.')
    }
    if (artifact.isCurrent) {
      if (currentLogicalIds.has(artifact.logicalId)) throw new DomainError('INCOMPLETE_AUDIT', 'Conflicting current versions make this audit incomplete.')
      currentLogicalIds.add(artifact.logicalId)
    }
  }
  const visiting = new Set<string>()
  const depths = new Map<string, number>()
  function visit(id: string): number {
    if (visiting.has(id)) throw new DomainError('INCOMPLETE_AUDIT', 'A dependency cycle makes this audit incomplete.')
    const previous = depths.get(id)
    if (previous !== undefined) return previous
    visiting.add(id)
    let depth = 0
    for (const input of dependencies.get(id) ?? []) depth = Math.max(depth, visit(input) + 1)
    visiting.delete(id)
    if (depth > 12) throw new DomainError('INCOMPLETE_AUDIT', 'Dependency depth exceeds 12; this audit is incomplete.')
    depths.set(id, depth)
    return depth
  }
  for (const id of artifacts.keys()) visit(id)
  return depths
}

export function planRepair(snapshot: WorkspaceSnapshot, impact: ImpactReport): RepairPlan {
  validateLineage(snapshot)
  if (!impact.complete || impact.revision !== snapshot.workspace.revision) {
    throw new DomainError('REVISION_CONFLICT', 'Refresh the workspace before planning a repair.')
  }
  if (!snapshot.artifacts.some((artifact) => artifact.id === impact.sourceArtifactId)) {
    throw new DomainError('NOT_FOUND', 'Source version not found.', 404)
  }
  const selected = snapshot.artifacts.filter((artifact) => artifact.isCurrent && artifact.status === 'stale' && !['source', 'case'].includes(artifact.kind))
  const selectedIds = new Set(selected.map((artifact) => artifact.id))
  const pending = new Map(selected.map((artifact) => [artifact.id, new Set(artifact.inputIds.filter((id) => selectedIds.has(id)))]))
  const artifactIds: string[] = []
  while (pending.size) {
    const ready = [...pending].filter(([, inputs]) => inputs.size === 0).map(([id]) => id).sort()
    if (!ready.length) throw new DomainError('INCOMPLETE_AUDIT', 'A dependency cycle prevents repair ordering.')
    for (const id of ready) {
      artifactIds.push(id)
      pending.delete(id)
      for (const inputs of pending.values()) inputs.delete(id)
    }
  }

  const predecessors = new Map(snapshot.edges.filter((edge) => edge.type === 'SUPERSEDES').map((edge) => [edge.from, edge.to]))
  const sourceReplacements: Record<string, string> = {}
  for (const source of snapshot.artifacts.filter((artifact) => artifact.kind === 'source' && artifact.isCurrent)) {
    const seen = new Set([source.id])
    let oldId = predecessors.get(source.id)
    while (oldId) {
      if (seen.has(oldId)) throw new DomainError('INCOMPLETE_AUDIT', 'A source-version cycle prevents a complete audit.')
      seen.add(oldId)
      sourceReplacements[oldId] = source.id
      oldId = predecessors.get(oldId)
    }
  }
  return {
    baseRevision: snapshot.workspace.revision,
    artifactIds,
    sourceReplacements,
    preserved: snapshot.artifacts
      .filter((artifact) => artifact.isCurrent && !selectedIds.has(artifact.id) && !artifact.needsReview && !['source', 'case'].includes(artifact.kind))
      .map(({ id, contentHash }) => ({ id, contentHash })).sort((a, b) => a.id.localeCompare(b.id)),
  }
}
