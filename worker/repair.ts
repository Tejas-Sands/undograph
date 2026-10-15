import { correctionRequestSchema, repairPlanSchema, sourceBodySchema, type Artifact, type CorrectionRequest, type ImpactReport, type RepairPlan, type RepairReport } from '../shared/contracts'
import { DomainError, hashCanonical, validateLineage } from './domain'
import type { Env } from './env'
import { findImpact, loadSnapshot, queryGraph } from './graph/store'

export async function commitCorrection(env: Env, graphName: string, request: CorrectionRequest): Promise<ImpactReport> {
  const input = correctionRequestSchema.parse(request)
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  const source = snapshot.artifacts.find((a) => a.id === input.sourceArtifactId)
  if (!source || source.kind !== 'source') throw new DomainError('NOT_FOUND', 'Source version not found.', 404)
  if (snapshot.workspace.revision !== input.expectedRevision || !source.isCurrent) throw new DomainError('REVISION_CONFLICT', 'The source has changed. Refresh before correcting it.')
  if (snapshot.artifacts.length >= 250) throw new DomainError('ARTIFACT_LIMIT', 'This workspace reached its version limit. Export or reset it before continuing.', 429)
  const body = sourceBodySchema.parse(source.body)
  const statements = [...body.text.matchAll(/Change-of-mind returns are accepted within (\d+) days of delivery\./g)]
  if (body.category !== 'return-policy' || statements.length !== 1) throw new DomainError('INVALID_CORRECTION', 'Only the synthetic return-window field can be corrected.', 422)
  if (Number(statements[0][1]) === input.returnWindowDays) throw new DomainError('NO_CHANGE', 'The source already has this return window.', 422)
  const nextBody = { ...body, text: body.text.replace(statements[0][0], `Change-of-mind returns are accepted within ${input.returnWindowDays} days of delivery.`) }
  const impact = await findImpact(env, graphName, source.id)
  const id = `source_${crypto.randomUUID().replaceAll('-', '')}`
  const result = await queryGraph(env, graphName, 'commitCorrection', {
    revision: input.expectedRevision, artifactCount: snapshot.artifacts.length, activeRunId: snapshot.workspace.activeRunId ?? null, oldId: source.id, id,
    logicalId: source.logicalId, bodyJson: JSON.stringify(nextBody), contentHash: await hashCanonical({ kind: 'source', body: nextBody }),
    dependencyHash: await hashCanonical({ inputs: [], stage: 'operator-correction', promptVersion: 'v1' }),
    now: Date.now(), reason: input.reason, changeId: `change_${crypto.randomUUID().replaceAll('-', '')}`, affectedIds: impact.affected.map((a) => a.id),
  })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'Work changed while correcting the source. Refresh and retry.')
  return findImpact(env, graphName, source.id)
}

export async function loadRepairPlan(env: Env, graphName: string, runId: string): Promise<RepairPlan> {
  const rows = await queryGraph<{ json: string | null }>(env, graphName, 'runPlan', { id: runId })
  if (!rows[0]?.json) throw new DomainError('INCOMPLETE_AUDIT', 'The repair has no persisted plan.')
  return repairPlanSchema.parse(JSON.parse(rows[0].json))
}

export async function promoteRepair(env: Env, graphName: string, runId: string, revision: number): Promise<RepairReport> {
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  const existing = snapshot.reports.find((report) => report.runId === runId)
  if (existing) return existing
  const plan = await loadRepairPlan(env, graphName, runId)
  if (plan.baseRevision !== revision) throw new DomainError('REVISION_CONFLICT', 'The repair revision changed.')
  const candidates = snapshot.artifacts.filter((a) => a.runId === runId && a.status === 'candidate')
  const previous = plan.artifactIds.map((id) => snapshot.artifacts.find((a) => a.id === id)!)
  if (candidates.length !== previous.length || previous.some((old) => !old || !candidates.some((a) => a.logicalId === old.logicalId)) || new Set(candidates.map((a) => a.logicalId)).size !== previous.length) {
    throw new DomainError('INCOMPLETE_REPAIR', 'Every planned replacement must exist before publication.')
  }
  const reportId = `${runId}_report`
  const result = await queryGraph(env, graphName, 'promoteRepair', {
    runId, revision, candidateIds: candidates.map((a) => a.id), oldIds: plan.artifactIds,
    preservedIds: plan.preserved.map((a) => a.id), preservedPairs: plan.preserved.map((a) => [a.id, a.contentHash]),
    preservedJson: JSON.stringify(plan.preserved), logicalIdsJson: JSON.stringify(previous.map((a) => a.logicalId).sort()), reportId, now: Date.now(),
  })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'The workspace changed; the repair candidates were not published.')
  return (await loadSnapshot(env, graphName)).reports.find((report) => report.id === reportId)!
}

export async function releaseDraft(env: Env, graphName: string, artifactId: string, revision: number): Promise<Artifact> {
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  const artifact = snapshot.artifacts.find((a) => a.id === artifactId)
  if (!artifact || artifact.kind !== 'reply') throw new DomainError('NOT_FOUND', 'Reply version not found.', 404)
  if (snapshot.workspace.revision !== revision) throw new DomainError('REVISION_CONFLICT', 'Refresh before marking this draft reviewed.')
  const result = await queryGraph(env, graphName, 'releaseDraft', { id: artifactId, revision })
  if (!result.length) throw new DomainError('STALE_RELEASE', 'This draft or its recorded evidence is stale or requires review. Repair it before marking it reviewed.')
  return (await loadSnapshot(env, graphName)).artifacts.find((a) => a.id === artifactId)!
}
