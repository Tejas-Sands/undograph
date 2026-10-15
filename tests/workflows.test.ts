import { env } from 'cloudflare:test'
import { WorkflowStep } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withGraph } from '../worker/graph/client'
import { ensureSchema, initializeWorkspace, loadSnapshot } from '../worker/graph/store'
import { launchRun, loadRun, loadWorkspace, prepareRun, promoteBuild } from '../worker/runs'
import { executeBuild } from '../worker/workflows'
import type { Env, WorkflowParams } from '../worker/env'
import { syntheticAI } from './helpers/synthetic-ai'

const bindings = env as unknown as Env
let graphName: string
let localEnv: Env
beforeEach(async () => {
  graphName = `${bindings.GRAPH_PREFIX}workflow_${crypto.randomUUID().replaceAll('-', '')}`
  localEnv = { ...bindings, CONTROL_GRAPH: `${graphName}_control` }
  await ensureSchema(localEnv, localEnv.CONTROL_GRAPH!)
  await initializeWorkspace(localEnv, graphName, 'visitor', Date.now() + 86_400_000)
})
afterEach(async () => {
  for (const name of [graphName, localEnv.CONTROL_GRAPH!]) await withGraph(localEnv, name, (graph) => graph.delete())
})
const request = { kind: 'build' as const, expectedRevision: 0 }

describe.skipIf(!bindings.FALKORDB_HOST || !bindings.FALKORDB_PASSWORD)('durable build lifecycle', () => {
  it('completes a native Workflow and reopens all persisted work', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'native-build')
    const workflow = (env as unknown as { TEST_BUILD_WORKFLOW: Workflow<WorkflowParams> }).TEST_BUILD_WORKFLOW
    const instance = await workflow.create({ id: run.id, params: { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor', controlGraph: localEnv.CONTROL_GRAPH } })
    await expect.poll(async () => (await instance.status()).status, { timeout: 30_000 }).toBe('complete')
    await promoteBuild(localEnv, graphName, run.id, 0)
    const reopened = await loadSnapshot(localEnv, graphName)
    expect(reopened.runs[0]).toMatchObject({ status: 'succeeded', modelCalls: 4, origin: 'live' })
    expect(reopened.artifacts.filter((artifact) => !['source', 'case'].includes(artifact.kind) && artifact.isCurrent)).toHaveLength(6)
    expect(reopened.sessions).toHaveLength(2)
    expect(reopened.steps).toHaveLength(6)
    expect(reopened.edges.filter((edge) => edge.type === 'READ')).toHaveLength(13)
    expect(reopened.workspace.activeRunId).toBeUndefined()
    expect((await loadRun(localEnv, graphName, run.id)).steps.every((step) => step.status === 'succeeded')).toBe(true)
  })
  it('recovers the same run ID and rejects changed idempotent requests', async () => {
    const first = await prepareRun(localEnv, graphName, request, 'stable-key')
    expect((await prepareRun(localEnv, graphName, request, 'stable-key')).id).toBe(first.id)
    await expect(prepareRun(localEnv, graphName, { ...request, expectedRevision: 1 }, 'stable-key')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect((await loadSnapshot(localEnv, graphName)).runs).toHaveLength(1)
  })
  it('accepts concurrent identical requests as one persisted run', async () => {
    const runs = await Promise.all([1, 2, 3].map(() => prepareRun(localEnv, graphName, request, 'concurrent-identical')))
    expect(new Set(runs.map((run) => run.id)).size).toBe(1)
    expect((await loadSnapshot(localEnv, graphName)).runs).toHaveLength(1)
  })
  it('rejects competing active runs and foreign run IDs', async () => {
    await prepareRun(localEnv, graphName, request, 'first-run')
    await expect(prepareRun(localEnv, graphName, request, 'second-run')).rejects.toMatchObject({ code: 'RUN_IN_PROGRESS' })
    await expect(loadRun(localEnv, graphName, 'foreign')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
  it('retains the queued run when launch fails and recovers with the same identity', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'recover-launch')
    const broken = { create: async () => { throw new Error('unreachable') }, get: async () => ({ status: async () => { throw new Error('missing') } }) } as unknown as Workflow<WorkflowParams>
    await expect(launchRun({ ...localEnv, BUILD_WORKFLOW: broken }, graphName, run, 'visitor')).rejects.toMatchObject({ code: 'RUN_LAUNCH_PENDING' })
    expect((await loadRun(localEnv, graphName, run.id)).run.status).toBe('queued')
    const recovered = await prepareRun(localEnv, graphName, request, 'recover-launch')
    const workflow = (env as unknown as { TEST_BUILD_WORKFLOW: Workflow<WorkflowParams> }).TEST_BUILD_WORKFLOW
    await launchRun({ ...localEnv, BUILD_WORKFLOW: workflow }, graphName, recovered, 'visitor')
    await expect.poll(async () => (await loadRun(localEnv, graphName, run.id)).run.status, { timeout: 30_000 }).toBe('succeeded')
  })
  it('checkpoints model output separately from retried persistence', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'checkpoint')
    let calls = 0
    const ai = { run: async (_model: unknown, input: unknown) => { calls++; return syntheticAI(input) } } as unknown as Ai
    const cache = new Map<string, unknown>()
    let lostAcknowledgement = false
    const scheduler = { do: async (name: string, _config: unknown, callback: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name)
      let result = await callback()
      if (name === 'extract-policy.save' && !lostAcknowledgement) { lostAcknowledgement = true; result = await callback() }
      cache.set(name, result)
      return result
    } } as unknown as WorkflowStep
    await executeBuild({ ...localEnv, AI: ai }, { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor' }, scheduler)
    expect(lostAcknowledgement).toBe(true)
    expect(calls).toBe(4)
    expect((await loadSnapshot(localEnv, graphName)).artifacts).toHaveLength(11)
  })
  it('keeps partial candidates unpublished after a model failure', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'failed-model')
    let calls = 0
    const ai = { run: async (_model: unknown, input: unknown) => {
      if (++calls === 2) throw Object.assign(new Error('private error'), { status: 401 })
      return syntheticAI(input)
    } } as unknown as Ai
    const scheduler = { do: async (_name: string, _config: unknown, callback: () => Promise<unknown>) => callback() } as unknown as WorkflowStep
    await expect(executeBuild({ ...localEnv, AI: ai }, { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor' }, scheduler)).rejects.toThrow()
    const snapshot = await loadSnapshot(localEnv, graphName)
    expect(snapshot.runs[0]).toMatchObject({ status: 'failed', errorCode: 'MODEL_UNAVAILABLE', modelCalls: 2 })
    expect(snapshot.artifacts.filter((artifact) => artifact.kind === 'policy-facts')).toHaveLength(1)
    expect(snapshot.artifacts.filter((artifact) => artifact.status === 'candidate')).toHaveLength(2)
    expect(snapshot.artifacts.filter((artifact) => artifact.isCurrent)).toHaveLength(5)
  })
  it('persists a native Workflow model failure without retrying authorization errors', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'native-failed-model')
    const binding = (env as unknown as { FAILED_BUILD_WORKFLOW: Workflow<WorkflowParams> }).FAILED_BUILD_WORKFLOW
    const instance = await binding.create({ id: run.id, params: { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor', controlGraph: localEnv.CONTROL_GRAPH } })
    await expect.poll(async () => (await instance.status()).status, { timeout: 30_000 }).toBe('errored')
    expect((await loadRun(localEnv, graphName, run.id)).run).toMatchObject({ status: 'failed', errorCode: 'MODEL_UNAVAILABLE', modelCalls: 1 })
  })
  for (const recovery of ['launch', 'workspace', 'run'] as const) it(`reconciles an ended Workflow after failure recording was unavailable through ${recovery}`, async () => {
    const run = await prepareRun(localEnv, graphName, request, `failure-recording-${recovery}`)
    const scheduler = { do: async (stage: string, _config: unknown, callback: () => Promise<unknown>) => {
      if (['extract-policy.read', 'record run failure'].includes(stage)) throw new Error('Database retries exhausted')
      return callback()
    } } as unknown as WorkflowStep
    await expect(executeBuild(localEnv, { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor' }, scheduler)).rejects.toThrow('Database retries exhausted')
    expect((await loadSnapshot(localEnv, graphName)).runs[0].status).toBe('running')
    const binding = {
      create: async () => { throw new Error('Already exists') },
      get: async () => ({ status: async () => ({ status: 'errored', error: { name: 'Error', message: 'private provider/database details' } }) }),
    } as unknown as Workflow<WorkflowParams>
    const restored = { ...localEnv, BUILD_WORKFLOW: binding }
    if (recovery === 'launch') await launchRun(restored, graphName, run, 'visitor')
    else if (recovery === 'workspace') await loadWorkspace(restored, graphName)
    else await loadRun(restored, graphName, run.id)
    const snapshot = await loadSnapshot(localEnv, graphName)
    expect(snapshot.runs[0]).toMatchObject({ status: 'failed', errorCode: 'WORKFLOW_FAILED' })
    expect(snapshot.workspace.activeRunId).toBeUndefined()
    expect(JSON.stringify(snapshot)).not.toContain('private provider/database details')
    expect((await prepareRun(localEnv, graphName, request, `replacement-${recovery}`)).status).toBe('queued')
  })
  it('preserves active graph state when Workflow status is unavailable', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'unknown-workflow-status')
    const binding = { get: async () => { throw new Error('Status unavailable') } } as unknown as Workflow<WorkflowParams>
    const restored = { ...localEnv, BUILD_WORKFLOW: binding }
    expect((await loadWorkspace(restored, graphName)).workspace.activeRunId).toBe(run.id)
    expect((await loadRun(restored, graphName, run.id)).run.status).toBe('queued')
  })
  it('retains provider usage for rejected structured output', async () => {
    const run = await prepareRun(localEnv, graphName, request, 'invalid-usage')
    const ai = { run: async () => ({ response: 'invalid JSON', usage: { prompt_tokens: 11, completion_tokens: 7 } }) } as unknown as Ai
    const scheduler = { do: async (_name: string, _config: unknown, callback: () => Promise<unknown>) => callback() } as unknown as WorkflowStep
    await expect(executeBuild({ ...localEnv, AI: ai }, { graphName, runId: run.id, baseRevision: 0, visitorId: 'visitor' }, scheduler)).rejects.toThrow()
    const result = await loadRun(localEnv, graphName, run.id)
    expect(result.run).toMatchObject({ status: 'failed', modelCalls: 2 })
    expect(result.steps[0]).toMatchObject({ inputTokens: 22, outputTokens: 14 })
  })
})
