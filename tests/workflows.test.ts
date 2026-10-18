import { env } from 'cloudflare:test'
import { WorkflowStep } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withGraph } from '../worker/graph/client'
import { ensureSchema, initializeWorkspace, loadSnapshot } from '../worker/graph/store'
import { launchRun, loadRun, loadWorkspace, prepareRun, promoteBuild } from '../worker/runs'
import { executeBuild, executeRepair } from '../worker/workflows'
import { commitCorrection } from '../worker/repair'
import type { Env, WorkflowParams } from '../worker/env'
import { syntheticAI } from './helpers/synthetic-ai'
import { projectExample, researchExample } from '../shared/knowledge'
import { releaseDraft } from '../worker/repair'
import { deleteGraph } from '../worker/graph/store'

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
  it.skipIf(!bindings.GRAPH_GATEWAY_URL)('reopens identical inputs when another initializer finishes before configuration', async () => {
    await deleteGraph(localEnv, graphName)
    const originalFetch = globalThis.fetch.bind(globalThis)
    let concurrent = false
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const operation = JSON.parse(String(init?.body))
      if (!concurrent && operation.action === 'query' && operation.query === 'configureWorkspace') {
        concurrent = true
        await initializeWorkspace(localEnv, graphName, 'visitor', Date.now()+86_400_000, projectExample)
      }
      return originalFetch(input, init)
    })
    try {
      const result = await initializeWorkspace(localEnv, graphName, 'visitor', Date.now()+86_400_000, projectExample)
      expect(concurrent).toBe(true)
      expect(result.workspace).toMatchObject({ name: projectExample.name, mode: 'knowledge' })
      expect(result.artifacts).toHaveLength(projectExample.sources.length + projectExample.questions.length)
    } finally { fetch.mockRestore() }
  })
  it.skipIf(!bindings.GRAPH_GATEWAY_URL)('keeps maximum custom build and repair within 50 requests with correction and save retries', async () => {
    await deleteGraph(localEnv, graphName)
    const scenario = { ...projectExample, sources: [...projectExample.sources, { id: 'extra', title: 'Other notes', text: 'The archive is in room 12.' }], questions: projectExample.questions.map(question => ({ ...question, sourceIds: ['launch', 'owners', 'extra'] })) }
    await initializeWorkspace(localEnv, graphName, 'visitor', Date.now()+86_400_000, scenario)
    const originalFetch = globalThis.fetch.bind(globalThis)
    let counting = false, requests = 0, calls = 0
    const spend = () => { if (++requests > 50) throw new Error('Too many subrequests.') }
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => { if (counting) spend(); return originalFetch(input, init) })
    const runtime = { ...localEnv, AI: { run: async (_model: unknown, input: unknown) => { spend(); return ++calls % 2 ? { response: 'invalid JSON' } : syntheticAI(input) } } as unknown as Ai }
    try {
      for (const kind of ['build','repair'] as const) {
        const revision = kind === 'build' ? 0 : 3
        const run = await prepareRun(localEnv, graphName, { kind, expectedRevision: revision }, `general-budget-${kind}`)
        let repeated = false
        const scheduler = { do: async (name: string, _config: unknown, work: () => Promise<unknown>) => { let result = await work(); if (name.endsWith('.save') && !repeated) { repeated = true; result = await work() } return result } } as unknown as WorkflowStep
        requests=0; calls=0; counting=true
        await (kind === 'build' ? executeBuild : executeRepair)(runtime, { graphName, runId: run.id, baseRevision: revision, visitorId: 'visitor' }, scheduler)
        counting=false
        expect(requests).toBeLessThanOrEqual(50)
        expect(repeated).toBe(true)
        if (kind === 'build') {
          for (const [index, source] of scenario.sources.entries()) await commitCorrection(localEnv, graphName, { sourceArtifactId: `source_${source.id}_v1`, expectedRevision: index, text: `${source.text} Updated source.`, reason: 'Correct every source for a maximum-size repair.' })
          expect((await loadSnapshot(localEnv, graphName)).artifacts.filter(artifact => artifact.isCurrent && artifact.status === 'stale')).toHaveLength(6)
        }
      }
    } finally { fetch.mockRestore() }
  })
  it.each([projectExample, researchExample])('repairs user-entered $name sources and preserves an independent answer', async (scenario) => {
    await deleteGraph(localEnv, graphName)
    const initial = await initializeWorkspace(localEnv, graphName, 'visitor', Date.now()+86_400_000, scenario)
    expect(initial.workspace).toMatchObject({ name: scenario.name, mode: 'knowledge' })
    expect((await initializeWorkspace(localEnv, graphName, 'visitor', initial.workspace.expiresAt, scenario)).artifacts).toEqual(initial.artifacts)
    await expect(initializeWorkspace(localEnv, graphName, 'visitor', initial.workspace.expiresAt, { ...scenario, name: 'Different' })).rejects.toMatchObject({ code: 'SCENARIO_CONFLICT' })
    const ai = { run: async (_model: unknown, input: unknown) => syntheticAI(input) } as unknown as Ai
    const runtime = { ...localEnv, AI: ai }
    const scheduler = { do: async (_name: string, _config: unknown, work: () => Promise<unknown>) => work() } as unknown as WorkflowStep
    const build = await prepareRun(runtime, graphName, request, 'custom-build')
    await executeBuild(runtime, { graphName, runId: build.id, baseRevision: 0, visitorId: 'visitor' }, scheduler)
    const original = await loadSnapshot(localEnv, graphName)
    const independentId = `answer:${scenario.questions.at(-1)!.id}`
    const independent = original.artifacts.find(artifact => artifact.logicalId === independentId && artifact.isCurrent)!
    const source = original.artifacts.find(artifact => artifact.logicalId === `source:${scenario.sources[0].id}` && artifact.isCurrent)!
    const impact = await commitCorrection(runtime, graphName, { sourceArtifactId: source.id, expectedRevision: 0, text: scenario.sources[0].text.replace(/November 12|42/, scenario.name === 'Atlas release' ? 'November 19' : '51'), reason: 'Judge corrects an entered fact.' })
    expect(impact.affected.length).toBe(scenario.name === 'Atlas release' ? 3 : 2)
    const stale = (await loadSnapshot(localEnv, graphName)).artifacts.find(artifact => artifact.kind === 'reply' && artifact.status === 'stale')!
    await expect(releaseDraft(runtime, graphName, stale.id, 1)).rejects.toMatchObject({ code: 'STALE_RELEASE' })
    const repair = await prepareRun(runtime, graphName, { kind: 'repair', expectedRevision: 1 }, 'custom-repair')
    await executeRepair(runtime, { graphName, runId: repair.id, baseRevision: 1, visitorId: 'visitor' }, scheduler)
    const repaired = await loadSnapshot(localEnv, graphName)
    expect(repaired.artifacts.find(artifact => artifact.id === independent.id)).toEqual(independent)
    expect(repaired.artifacts.filter(artifact => artifact.isCurrent && artifact.status === 'stale')).toHaveLength(0)
    const answer = repaired.artifacts.find(artifact => artifact.logicalId === `answer:${scenario.questions[0].id}` && artifact.isCurrent)!
    expect(JSON.stringify(answer.body)).toContain(scenario.name === 'Atlas release' ? 'November 19' : '51')
    expect(repaired.reports[0].preserved).toContainEqual({ id: independent.id, contentHash: independent.contentHash })
  })
  it.skipIf(!bindings.GRAPH_GATEWAY_URL)('builds and repairs within the free Workflow request budget, including corrected model output and a lost save acknowledgement', async () => {
    const originalFetch = globalThis.fetch.bind(globalThis)
    let counting = false, requests = 0, calls = 0
    const spend = () => { if (++requests > 50) throw new Error('Too many subrequests.') }
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (counting) spend()
      return originalFetch(input, init)
    })
    const ai = { run: async (_model: unknown, input: unknown) => {
      spend()
      return ++calls % 2 ? { response: 'invalid JSON' } : syntheticAI(input)
    } } as unknown as Ai
    const runtime = { ...localEnv, AI: ai }
    let preserved: unknown
    try {
      for (const kind of ['build', 'repair'] as const) {
        const revision = kind === 'build' ? 0 : 1
        const run = await prepareRun(localEnv, graphName, { kind, expectedRevision: revision }, `request-budget-${kind}`)
        let lostAcknowledgement = false
        const scheduler = { do: async (name: string, _config: unknown, work: () => Promise<unknown>) => {
          let result = await work()
          if (name.endsWith('.save') && !lostAcknowledgement) {
            lostAcknowledgement = true
            result = await work()
          }
          return result
        } } as unknown as WorkflowStep
        requests = 0; calls = 0; counting = true
        const execute = kind === 'build' ? executeBuild : executeRepair
        await expect(execute(runtime, { graphName, runId: run.id, baseRevision: revision, visitorId: 'visitor' }, scheduler)).resolves.toBe(run.id)
        counting = false
        expect(requests).toBeLessThanOrEqual(50)
        expect(calls).toBe(kind === 'build' ? 8 : 6)
        expect(lostAcknowledgement).toBe(true)
        const snapshot = await loadSnapshot(localEnv, graphName)
        expect(snapshot.runs.find((value) => value.id === run.id)?.status).toBe('succeeded')
        if (kind === 'build') {
          preserved = snapshot.artifacts.find((value) => value.logicalId === 'reply:A001')
          expect(snapshot.artifacts.filter((value) => value.isCurrent)).toHaveLength(11)
          await commitCorrection(localEnv, graphName, { sourceArtifactId: 'source_return_policy_v1', expectedRevision: 0, returnWindowDays: 14, reason: 'Verify free-plan repair.' })
        } else {
          expect(snapshot.artifacts.find((value) => value.logicalId === 'reply:A001')).toEqual(preserved)
          expect(snapshot.artifacts.filter((value) => value.isCurrent && value.status === 'stale')).toHaveLength(0)
          expect(snapshot.reports[0].repairedLogicalIds).toHaveLength(5)
        }
      }
    } finally { fetch.mockRestore() }
  })
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
