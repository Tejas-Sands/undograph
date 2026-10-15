import { env } from 'cloudflare:workers'
import type { WorkflowStep } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assessmentSchema, replyDraftSchema, sourceBodySchema } from '../shared/contracts'
import { planRepair } from '../worker/domain'
import type { Env, WorkflowParams } from '../worker/env'
import { withGraph } from '../worker/graph/client'
import { ensureSchema, findImpact, initializeWorkspace, loadSnapshot } from '../worker/graph/store'
import * as graphStore from '../worker/graph/store'
import { commitCorrection, promoteRepair, releaseDraft } from '../worker/repair'
import { launchRun, loadRun, prepareRun } from '../worker/runs'
import { executeBuild, executeRepair } from '../worker/workflows'
import { supportWork } from './helpers/support-work'
import { syntheticAI } from './helpers/synthetic-ai'

const bindings = env as unknown as Env
let local: Env
let name: string
const inline = { do: async (_name: string, _config: unknown, work: () => Promise<unknown>) => work() } as unknown as WorkflowStep
const synthetic = { run: async (_model: unknown, input: unknown) => syntheticAI(input) } as unknown as Ai
const correction = { sourceArtifactId: 'source_return_policy_v1', expectedRevision: 0, returnWindowDays: 14, reason: 'Operator verified the correct window.' }

describe.skipIf(!bindings.FALKORDB_HOST || !bindings.FALKORDB_PASSWORD)('atomic source correction and selective repair', () => {
  beforeEach(async () => {
    name = `${bindings.GRAPH_PREFIX}repair_${crypto.randomUUID().replaceAll('-', '')}`
    local = { ...bindings, AI: synthetic, CONTROL_GRAPH: `${name}_control` }
    await ensureSchema(local, local.CONTROL_GRAPH!)
    await initializeWorkspace(local, name, 'workspace', Date.now() + 86_400_000)
    await supportWork(local, name)
  })
  afterEach(async () => {
    for (const graphName of [name, local.CONTROL_GRAPH!]) await withGraph(local, graphName, (graph) => graph.delete())
  })
  async function repair(key = 'selective-repair') {
    const run = await prepareRun(local, name, { kind: 'repair', expectedRevision: 1 }, key)
    return { run, params: { graphName: name, runId: run.id, baseRevision: 1, visitorId: 'visitor' } }
  }

  it('corrects the source and invalidates exactly five outputs while preserving independent work', async () => {
    const before = await loadSnapshot(local, name)
    const impact = await commitCorrection(local, name, correction)
    expect(impact.affected).toHaveLength(5)
    const after = await loadSnapshot(local, name)
    expect(after.workspace.revision).toBe(1)
    expect(after.changes).toHaveLength(1)
    expect(after.artifacts.filter((a) => a.status === 'stale')).toHaveLength(5)
    expect(after.artifacts.find((a) => a.id === 'reply_A001_v1')).toEqual(before.artifacts.find((a) => a.id === 'reply_A001_v1'))
    const newSource = after.artifacts.find((a) => a.logicalId === 'source:return-policy' && a.isCurrent)!
    expect(newSource.version).toBe(2)
    expect(sourceBodySchema.parse(newSource.body).text).toContain('within 14 days')
    expect(after.edges).toContainEqual({ from: newSource.id, to: correction.sourceArtifactId, type: 'SUPERSEDES' })
    await expect(releaseDraft(local, name, 'reply_R021_v1', 1)).rejects.toMatchObject({ code: 'STALE_RELEASE', status: 409 })
  })
  it('allows only one concurrent correction for the same revision', async () => {
    const attempts = await Promise.allSettled([14, 10].map((returnWindowDays) => commitCorrection(local, name, { ...correction, returnWindowDays })))
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((attempts.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'REVISION_CONFLICT' })
    const snapshot = await loadSnapshot(local, name)
    expect(snapshot.changes).toHaveLength(1)
    expect(snapshot.artifacts).toHaveLength(12)
  })
  for (const kind of ['build', 'repair'] as const) it(`rejects a correction whose impact was read before ${kind} publication`, async () => {
    if (kind === 'build') {
      await withGraph(local, name, (graph) => graph.delete())
      await initializeWorkspace(local, name, 'workspace', Date.now() + 86_400_000)
    } else await commitCorrection(local, name, correction)
    const revision = kind === 'build' ? 0 : 1
    const run = await prepareRun(local, name, { kind, expectedRevision: revision }, `publication-race-${kind}`)
    let reached!: () => void, resume!: () => void
    const atPublication = new Promise<void>((resolve) => { reached = resolve })
    const publicationGate = new Promise<void>((resolve) => { resume = resolve })
    const scheduler = { do: async (stage: string, _config: unknown, work: () => Promise<unknown>) => {
      if (stage === `publish ${kind}`) { reached(); await publicationGate }
      return work()
    } } as unknown as WorkflowStep
    const execute = kind === 'build' ? executeBuild : executeRepair
    const execution = execute(local, { graphName: name, runId: run.id, baseRevision: revision, visitorId: 'visitor' }, scheduler)
    await atPublication
    const before = await loadSnapshot(local, name)
    const source = before.artifacts.find((a) => a.isCurrent && a.logicalId === 'source:return-policy')!
    const request = { ...correction, sourceArtifactId: source.id, expectedRevision: revision, returnWindowDays: kind === 'build' ? 14 : 10 }
    const query = graphStore.queryGraph
    const intercept = vi.spyOn(graphStore, 'queryGraph').mockImplementation((async (...args: Parameters<typeof query>) => {
      if (args[2] === 'commitCorrection') { resume(); await execution }
      return query(...args)
    }) as typeof query)
    try {
      await expect(commitCorrection(local, name, request)).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 })
    } finally { intercept.mockRestore(); resume(); await execution }
    const published = await loadSnapshot(local, name)
    expect(published.workspace.revision).toBe(revision)
    expect(published.runs.find((value) => value.id === run.id)?.status).toBe('succeeded')
    expect((await commitCorrection(local, name, request)).affected).toHaveLength(5)
    const corrected = await loadSnapshot(local, name)
    expect(corrected.artifacts.filter((a) => a.isCurrent && a.status === 'stale')).toHaveLength(5)
  })
  it('retains historical releases and flags them for review', async () => {
    expect((await releaseDraft(local, name, 'reply_R021_v1', 0)).status).toBe('released')
    await commitCorrection(local, name, correction)
    const snapshot = await loadSnapshot(local, name)
    expect(snapshot.artifacts.find((a) => a.id === 'reply_R021_v1')).toMatchObject({ status: 'released', needsReview: true })
    expect(planRepair(snapshot, await findImpact(local, name, correction.sourceArtifactId)).artifactIds).toHaveLength(4)
    await expect(releaseDraft(local, name, 'reply_R021_v1', 1)).rejects.toMatchObject({ code: 'STALE_RELEASE' })
    const { params } = await repair('historical-release-repair')
    await executeRepair(local, params, inline)
    const repaired = await loadSnapshot(local, name)
    expect(repaired.reports[0].repairedLogicalIds).toHaveLength(4)
    expect(repaired.artifacts.find((a) => a.id === 'reply_R021_v1')).toMatchObject({ status: 'released', needsReview: true })
    expect(repaired.artifacts.filter((a) => a.logicalId === 'reply:R021')).toHaveLength(1)
  })
  it('checks freshness of every recorded ancestor inside release', async () => {
    await withGraph(local, name, (graph) => graph.query("MATCH (a:Artifact {id:'facts_v1'}) SET a.status = 'stale'"))
    await expect(releaseDraft(local, name, 'reply_R021_v1', 0)).rejects.toMatchObject({ code: 'STALE_RELEASE' })
    expect((await releaseDraft(local, name, 'reply_A001_v1', 0)).status).toBe('released')
    await expect(releaseDraft(local, name, 'foreign', 0)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
  it('publishes all five replacements with exact source remapping and a preserved account reply', async () => {
    await commitCorrection(local, name, correction)
    const { run, params } = await repair()
    await executeRepair(local, params, inline)
    const snapshot = await loadSnapshot(local, name)
    const current = snapshot.artifacts.filter((a) => a.isCurrent)
    expect(current.filter((a) => a.runId === run.id)).toHaveLength(5)
    expect(snapshot.runs[0]).toMatchObject({ status: 'succeeded', modelCalls: 3 })
    expect(assessmentSchema.parse(current.find((a) => a.logicalId === 'assessment:R021')!.body).decision).toBe('ineligible')
    expect(assessmentSchema.parse(current.find((a) => a.logicalId === 'assessment:R007')!.body).decision).toBe('eligible')
    const source = current.find((a) => a.logicalId === 'source:return-policy')!
    for (const reply of current.filter((a) => a.runId === run.id && a.kind === 'reply')) expect(replyDraftSchema.parse(reply.body).citations).toContain(source.id)
    const report = snapshot.reports[0]
    expect(report.repairedLogicalIds).toHaveLength(5)
    expect(report.preserved.map((a) => a.id)).toEqual(['reply_A001_v1'])
    expect(await promoteRepair(local, name, run.id, 1)).toEqual(report)
    expect((await prepareRun(local, name, { kind: 'repair', expectedRevision: 1 }, 'selective-repair')).id).toBe(run.id)
    expect((await releaseDraft(local, name, current.find((a) => a.logicalId === 'reply:R021')!.id, 1)).status).toBe('released')
  })
  it('executes the repair with a native Workflow', async () => {
    await commitCorrection(local, name, correction)
    const { run } = await repair('native-repair')
    const workflow = (env as unknown as { TEST_REPAIR_WORKFLOW: Workflow<WorkflowParams> }).TEST_REPAIR_WORKFLOW
    await launchRun({ ...local, REPAIR_WORKFLOW: workflow }, name, run, 'visitor')
    await expect.poll(async () => (await loadRun(local, name, run.id)).run.status, { timeout: 20_000 }).toBe('succeeded')
    expect((await loadRun(local, name, run.id)).report?.repairedLogicalIds).toHaveLength(5)
  })
  it('leaves partial candidates unpublished after an inference failure', async () => {
    await commitCorrection(local, name, correction)
    const { run, params } = await repair('failed-repair')
    let calls = 0
    local.AI = { run: async (_model: unknown, input: unknown) => {
      if (++calls === 2) throw Object.assign(new Error('provider unavailable'), { status: 401 })
      return syntheticAI(input)
    } } as unknown as Ai
    await expect(executeRepair(local, params, inline)).rejects.toThrow()
    const snapshot = await loadSnapshot(local, name)
    expect(snapshot.artifacts.filter((a) => a.status === 'stale')).toHaveLength(5)
    expect(snapshot.artifacts.filter((a) => a.runId === run.id && a.isCurrent)).toEqual([])
    expect(snapshot.runs[0].status).toBe('failed')
    expect(snapshot.reports).toEqual([])
  })
  it('makes an in-progress repair obsolete after another source correction', async () => {
    await commitCorrection(local, name, correction)
    const { run, params } = await repair('obsolete-repair')
    let calls = 0
    local.AI = { run: async (_model: unknown, input: unknown) => {
      if (++calls === 2) {
        const snapshot = await loadSnapshot(local, name)
        const source = snapshot.artifacts.find((a) => a.isCurrent && a.logicalId === 'source:return-policy')!
        await commitCorrection(local, name, { ...correction, sourceArtifactId: source.id, expectedRevision: 1, returnWindowDays: 10 })
      }
      return syntheticAI(input)
    } } as unknown as Ai
    await expect(executeRepair(local, params, inline)).rejects.toThrow()
    const snapshot = await loadSnapshot(local, name)
    expect(snapshot.workspace.revision).toBe(2)
    expect(snapshot.runs[0].status).toBe('obsolete')
    expect(snapshot.artifacts.filter((a) => a.runId === run.id && a.status === 'candidate').length).toBeGreaterThan(0)
    expect(snapshot.artifacts.filter((a) => a.runId === run.id && a.isCurrent)).toEqual([])
    expect(snapshot.artifacts.find((a) => a.id === 'reply_A001_v1')?.isCurrent).toBe(true)
    expect(snapshot.reports).toEqual([])
  })
  it('refuses a correction if the recorded lineage is corrupt', async () => {
    await withGraph(local, name, (graph) => graph.query("MATCH (a:Artifact {id:'facts_v1'}), (b:Artifact {id:'reply_R021_v1'}) MERGE (a)-[:DEPENDS_ON]->(b) SET a.inputIdsJson = '[\"source_return_policy_v1\",\"reply_R021_v1\"]'"))
    await expect(commitCorrection(local, name, correction)).rejects.toMatchObject({ code: 'INCOMPLETE_AUDIT' })
    expect((await loadSnapshot(local, name)).workspace.revision).toBe(0)
  })
  it('repairs earlier stale work through two consecutive source replacements', async () => {
    await commitCorrection(local, name, correction)
    const source = (await loadSnapshot(local, name)).artifacts.find((a) => a.logicalId === 'source:return-policy' && a.isCurrent)!
    const latestImpact = await commitCorrection(local, name, { ...correction, sourceArtifactId: source.id, expectedRevision: 1, returnWindowDays: 10 })
    expect(latestImpact.affected).toHaveLength(0)
    const run = await prepareRun(local, name, { kind: 'repair', expectedRevision: 2 }, 'consecutive-corrections')
    await executeRepair(local, { graphName: name, runId: run.id, baseRevision: 2, visitorId: 'visitor' }, inline)
    const snapshot = await loadSnapshot(local, name)
    expect(snapshot.reports[0].repairedLogicalIds).toHaveLength(5)
    const facts = snapshot.artifacts.find((a) => a.kind === 'policy-facts' && a.isCurrent)!
    expect(facts.body).toMatchObject({ returnWindowDays: 10 })
    expect(snapshot.artifacts.filter((a) => a.status === 'stale')).toEqual([])
  })
})
