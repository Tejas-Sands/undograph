import { runRequestSchema, type Artifact, type ArtifactWrite, type Run, type RunRequest, type RunResult } from '../shared/contracts'
import { DomainError, hashCanonical, validateLineage } from './domain'
import type { Env } from './env'
import { loadSnapshot, queryGraph, recordArtifact } from './graph/store'
import { reserveInference } from './limits'
import type { Usage } from './agents'

export async function prepareRun(env: Env, graphName: string, request: RunRequest, key: string): Promise<Run> {
  const input = runRequestSchema.parse(request)
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(key)) throw new DomainError('INVALID_IDEMPOTENCY_KEY', 'Provide an Idempotency-Key of 8–120 letters, numbers, underscores or hyphens.', 400)
  const snapshot = await loadSnapshot(env, graphName)
  const requestHash = await hashCanonical(input)
  const id = `run_${(await hashCanonical({ graphName, key })).slice(0, 32)}`
  const existing = snapshot.runs.find((run) => run.id === id)
  if (existing) {
    if (existing.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT', 'This request key was used with different parameters.')
    return existing
  }
  validateLineage(snapshot)
  if (snapshot.workspace.revision !== input.expectedRevision) throw new DomainError('REVISION_CONFLICT', 'Refresh the workspace before starting work.')
  if (snapshot.workspace.activeRunId) throw new DomainError('RUN_IN_PROGRESS', 'A run is already active. Reuse its request key to recover launch.')
  if (input.kind === 'build' && snapshot.artifacts.some((artifact) => artifact.isCurrent && !['source', 'case'].includes(artifact.kind))) {
    throw new DomainError('ALREADY_BUILT', 'This workspace already contains generated work. Correct a source and repair it, or reset the workspace.')
  }
  if (input.kind === 'repair') throw new DomainError('REPAIR_UNAVAILABLE', 'Repair execution is not implemented yet.', 409)
  const rows = await queryGraph(env, graphName, 'prepareRun', { id, type: input.kind, revision: input.expectedRevision, requestHash, now: Date.now(), sourceArtifactId: input.sourceArtifactId ?? null })
  if (!rows.length) {
    const concurrent = (await loadSnapshot(env, graphName)).runs.find((run) => run.id === id)
    if (concurrent?.requestHash === requestHash) return concurrent
    if (concurrent) throw new DomainError('IDEMPOTENCY_CONFLICT', 'This request key was used with different parameters.')
    throw new DomainError('RUN_IN_PROGRESS', 'The workspace changed while starting work. Refresh and retry with the same key.')
  }
  return (await loadRun(env, graphName, id)).run
}

export async function loadRun(env: Env, graphName: string, runId: string): Promise<RunResult> {
  const snapshot = await loadSnapshot(env, graphName)
  const run = snapshot.runs.find((value) => value.id === runId)
  if (!run) throw new DomainError('NOT_FOUND', 'Run not found.', 404)
  return { run, steps: snapshot.steps.filter((step) => step.runId === runId), ...(snapshot.reports.find((report) => report.runId === runId) ? { report: snapshot.reports.find((report) => report.runId === runId) } : {}) }
}

export async function launchRun(env: Env, graphName: string, run: Run, visitorId: string): Promise<void> {
  if (['succeeded', 'failed', 'obsolete'].includes(run.status)) return
  const binding = run.type === 'build' ? env.BUILD_WORKFLOW : env.REPAIR_WORKFLOW
  const params = { graphName, runId: run.id, baseRevision: run.baseRevision, visitorId, ...(env.CONTROL_GRAPH ? { controlGraph: env.CONTROL_GRAPH } : {}) }
  try {
    if (!binding) throw new Error('Missing workflow binding')
    let instance: WorkflowInstance
    try { instance = await binding.create({ id: run.id, params }) }
    catch { instance = await binding.get(run.id) }
    try { await instance.status() }
    finally { (instance as unknown as { [Symbol.dispose]?: () => void })[Symbol.dispose]?.() }
  } catch {
    throw new DomainError('RUN_LAUNCH_PENDING', 'The run is saved but launch could not be confirmed. Retry using the same request key.', 503)
  }
}

export async function beginRun(env: Env, graphName: string, runId: string) {
  const result = await queryGraph(env, graphName, 'beginRun', {
    id: runId, analystSession: `${runId}_analyst`, replySession: `${runId}_reply`, now: Date.now(),
  })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'The run is no longer current.')
}

export async function readInputs(env: Env, graphName: string, stepId: string, artifactIds: string[]): Promise<Artifact[]> {
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  if (new Set(artifactIds).size !== artifactIds.length) throw new DomainError('INVALID_DEPENDENCY', 'Recorded inputs must be distinct.', 422)
  const inputs = artifactIds.map((id) => {
    const artifact = snapshot.artifacts.find((value) => value.id === id)
    if (!artifact) throw new DomainError('NOT_FOUND', 'Input artifact not found.', 404)
    return artifact
  })
  const rows = await queryGraph(env, graphName, 'readInputs', { stepId, inputIds: artifactIds })
  if (!rows.length) throw new DomainError('STALE_INPUT', 'The run or its inputs changed before they could be read.')
  return inputs
}

export async function openStep(env: Env, graphName: string, runId: string, stage: string, inputIds: string[], analyst = false): Promise<Artifact[]> {
  const id = `${runId}_${stage}`
  const result = await queryGraph(env, graphName, 'createStep', { id, runId, stage, role: analyst ? 'policy-analyst' : 'reply-agent', sessionId: `${runId}_${analyst ? 'analyst' : 'reply'}`, now: Date.now() })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'The run is no longer current.')
  return readInputs(env, graphName, id, inputIds)
}

export async function logAttempt(env: Env, graphName: string, visitorId: string, runId: string, stage: string) {
  await reserveInference(env, visitorId)
  const result = await queryGraph(env, graphName, 'recordAttempt', { runId, stepId: `${runId}_${stage}` })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'The run changed before inference started.')
}

export async function saveOutput(env: Env, graphName: string, write: ArtifactWrite, usage: Usage): Promise<Artifact> {
  const artifact = await recordArtifact(env, graphName, write)
  const result = await queryGraph(env, graphName, 'completeStep', { stepId: write.stepId!, artifactId: artifact.id, now: Date.now(), inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null })
  if (!result.length) throw new DomainError('ARTIFACT_CONFLICT', 'Output was saved but its step could not be finalized.')
  return artifact
}

export async function promoteBuild(env: Env, graphName: string, runId: string, revision: number): Promise<void> {
  const snapshot = await loadSnapshot(env, graphName)
  validateLineage(snapshot)
  if (snapshot.runs.some((run) => run.id === runId && run.status === 'succeeded' && run.baseRevision === revision)) return
  const candidates = snapshot.artifacts.filter((artifact) => artifact.runId === runId && artifact.status === 'candidate')
  if (candidates.length !== 6 || new Set(candidates.map((artifact) => artifact.logicalId)).size !== 6) throw new DomainError('INCOMPLETE_BUILD', 'All six outputs must exist before publication.')
  const result = await queryGraph(env, graphName, 'promoteRun', { runId, revision, count: 6, now: Date.now() })
  if (!result.length) throw new DomainError('REVISION_CONFLICT', 'The workspace changed; candidate work was not published.')
}

export async function failRun(env: Env, graphName: string, runId: string, error: unknown) {
  const code = error instanceof DomainError ? error.code : 'RUN_FAILED'
  await queryGraph(env, graphName, 'failRun', { runId, errorCode: code, now: Date.now() })
}
