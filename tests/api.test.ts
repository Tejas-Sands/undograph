import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../worker/index'
import { runResultSchema, workspaceSnapshotSchema } from '../shared/contracts'
import type { Env } from '../worker/env'
import { ensureSchema } from '../worker/graph/store'
import { withGraph } from '../worker/graph/client'
import { visitorIdentity } from '../worker/identity'
import { beginRun, failRun, prepareRun } from '../worker/runs'
import { projectExample } from '../shared/knowledge'

let local: Env
beforeEach(async () => {
  const bindings = env as unknown as Env & { TEST_BUILD_WORKFLOW: Env['BUILD_WORKFLOW']; TEST_REPAIR_WORKFLOW: Env['REPAIR_WORKFLOW'] }
  local = { ...bindings, BUILD_WORKFLOW: bindings.TEST_BUILD_WORKFLOW, REPAIR_WORKFLOW: bindings.TEST_REPAIR_WORKFLOW, CONTROL_GRAPH: `${bindings.GRAPH_PREFIX}api_${crypto.randomUUID().replaceAll('-', '')}` }
  await ensureSchema(local, local.CONTROL_GRAPH!)
})
afterEach(async () => {
  const names = await withGraph(local, local.CONTROL_GRAPH!, async (graph) => (await graph.roQuery<{ id: string }>('MATCH (r:WorkspaceRegistry) RETURN r.id AS id')).data ?? [])
  for (const { id } of names) await withGraph(local, id, (graph) => graph.delete())
  await withGraph(local, local.CONTROL_GRAPH!, (graph) => graph.delete())
})
function request(path: string, method = 'GET', body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { ...(method !== 'GET' ? { Origin: 'http://localhost', 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } }, local)
}
async function workspace() {
  const response = await request('/api/workspace', 'POST', {})
  expect(response.status).toBe(200)
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0]
  return { cookie, data: workspaceSnapshotSchema.parse(await response.json()), response }
}

describe.skipIf(!(env as unknown as Env).FALKORDB_HOST || !(env as unknown as Env).FALKORDB_PASSWORD)('owned local build API', () => {
  it('persists custom inputs, rejects changed initialization and validates source scopes', async () => {
    const created = await request('/api/workspace', 'POST', { scenario: projectExample })
    expect(created.status).toBe(200)
    const cookie = created.headers.get('Set-Cookie')!.split(';')[0]
    const data = workspaceSnapshotSchema.parse(await created.json())
    expect(data.workspace).toMatchObject({ mode: 'knowledge', name: 'Atlas release' })
    expect(data.artifacts).toHaveLength(5)
    expect(await (await request('/api/workspace', 'GET', undefined, cookie)).json()).toEqual(data)
    expect((await request('/api/workspace', 'POST', { scenario: { ...projectExample, name: 'Changed' } }, cookie)).status).toBe(409)
    expect((await request('/api/workspace', 'POST', { scenario: { ...projectExample, questions: [{ ...projectExample.questions[0], sourceIds: ['foreign'] }] } })).status).toBe(422)
    const changed = await request('/api/sources/source_launch_v1/corrections', 'POST', { expectedRevision: 0, text: 'Atlas launches November 19.', reason: 'Judge correction' }, cookie)
    expect(changed.status).toBe(200)
    expect((await request('/api/sources/source_launch_v1/corrections', 'POST', { expectedRevision: 0, text: 'Old write', reason: 'Stale' }, cookie)).status).toBe(409)
    const fresh = await request('/api/workspace/reset', 'POST', { confirmation: 'RESET', scenario: { ...projectExample, name: 'New project' } }, cookie)
    expect(fresh.status).toBe(200)
    expect(workspaceSnapshotSchema.parse(await fresh.json()).workspace.name).toBe('New project')
  })
  it('creates and reopens a signed workspace without generated outputs', async () => {
    const first = await workspace()
    expect(first.response.headers.get('Set-Cookie')).toContain('HttpOnly')
    expect(first.response.headers.get('Set-Cookie')).toContain('SameSite=Lax')
    expect(first.data.artifacts).toHaveLength(5)
    const reopened = await request('/api/workspace', 'GET', undefined, first.cookie)
    expect(await reopened.json()).toEqual(first.data)
    expect(reopened.headers.get('Cache-Control')).toBe('no-store')
  })
  it('isolates visitors and rejects foreign run IDs', async () => {
    const first = await workspace()
    const second = await workspace()
    expect(first.data.workspace.id).not.toBe(second.data.workspace.id)
    const started = await request('/api/runs', 'POST', { kind: 'build', expectedRevision: 0 }, first.cookie, { 'Idempotency-Key': 'api-isolation-key' })
    expect(started.status).toBe(202)
    const run = runResultSchema.parse(await started.json())
    expect((await request(`/api/runs/${run.run.id}`, 'GET', undefined, second.cookie)).status).toBe(404)
    await expect.poll(async () => runResultSchema.parse(await (await request(`/api/runs/${run.run.id}`, 'GET', undefined, first.cookie)).json()).run.status, { timeout: 30_000 }).toBe('succeeded')
  })
  it('returns 202 for the same run on duplicate launch and recovers progress', async () => {
    const { cookie } = await workspace()
    const body = { kind: 'build', expectedRevision: 0 }
    const headers = { 'Idempotency-Key': 'api-stable-build' }
    const first = await request('/api/runs', 'POST', body, cookie, headers)
    expect(first.status).toBe(202)
    const run = runResultSchema.parse(await first.json())
    const second = await request('/api/runs', 'POST', body, cookie, headers)
    expect(second.status).toBe(202)
    expect(runResultSchema.parse(await second.json()).run.id).toBe(run.run.id)
    await expect.poll(async () => runResultSchema.parse(await (await request(`/api/runs/${run.run.id}`, 'GET', undefined, cookie)).json()).run.status, { timeout: 30_000 }).toBe('succeeded')
  })
  it('rejects absent identity and forged cookies', async () => {
    expect((await request('/api/workspace')).status).toBe(404)
    const { cookie } = await workspace()
    expect((await request('/api/workspace', 'GET', undefined, `${cookie}forged`)).status).toBe(404)
  })
  it('rejects cross-origin writes, oversized bodies and missing request identity', async () => {
    expect((await request('/api/workspace', 'POST', {}, undefined, { Origin: 'https://foreign.example' })).status).toBe(403)
    const { cookie } = await workspace()
    expect((await request('/api/runs', 'POST', { extra: 'x'.repeat(17_000) }, cookie)).status).toBe(413)
    expect((await request('/api/runs', 'POST', { kind: 'build', expectedRevision: 0 }, cookie)).status).toBe(400)
  })
  it('corrects, audits and repairs through owned HTTP routes', async () => {
    const { cookie } = await workspace()
    const build = runResultSchema.parse(await (await request('/api/runs', 'POST', { kind: 'build', expectedRevision: 0 }, cookie, { 'Idempotency-Key': 'api-full-build' })).json())
    await expect.poll(async () => runResultSchema.parse(await (await request(`/api/runs/${build.run.id}`, 'GET', undefined, cookie)).json()).run.status, { timeout: 20_000 }).toBe('succeeded')
    const before = workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, cookie)).json())
    const account = before.artifacts.find((a) => a.logicalId === 'reply:A001' && a.isCurrent)!
    const source = before.artifacts.find((a) => a.logicalId === 'source:return-policy' && a.isCurrent)!
    const changed = await request(`/api/sources/${source.id}/corrections`, 'POST', { expectedRevision: 0, returnWindowDays: 14, reason: 'Verified policy window.' }, cookie)
    expect(changed.status).toBe(200)
    const impact = await changed.json() as { affected: unknown[] }
    expect(impact.affected).toHaveLength(5)
    expect((await request('/api/artifacts/foreign/impact', 'GET', undefined, cookie)).status).toBe(404)
    const reply = before.artifacts.find((a) => a.logicalId === 'reply:R021')!
    expect((await request(`/api/artifacts/${reply.id}/release`, 'POST', { expectedRevision: 1 }, cookie)).status).toBe(409)
    const repairResponse = await request('/api/runs', 'POST', { kind: 'repair', expectedRevision: 1, sourceArtifactId: source.id }, cookie, { 'Idempotency-Key': 'api-full-repair' })
    expect(repairResponse.status).toBe(202)
    const repair = runResultSchema.parse(await repairResponse.json())
    await expect.poll(async () => runResultSchema.parse(await (await request(`/api/runs/${repair.run.id}`, 'GET', undefined, cookie)).json()).run.status, { timeout: 20_000 }).toBe('succeeded')
    const after = workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, cookie)).json())
    expect(after.reports[0].repairedLogicalIds).toHaveLength(5)
    expect(after.artifacts.find((a) => a.logicalId === 'reply:A001' && a.isCurrent)).toEqual(account)
  })
  it('exports only synthetic audit records without authentication or connection data', async () => {
    const { cookie } = await workspace()
    const response = await request('/api/export', 'GET', undefined, cookie)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('Northstar Goods')
    expect(text).not.toContain(cookie.split('=')[1])
    expect(text).not.toContain(local.SESSION_SECRET)
    expect(text).not.toContain(local.FALKORDB_PASSWORD)
    expect(text).not.toContain('FALKORDB_HOST')
    expect(text).not.toContain('graphName')
  })
  it('resets only the current workspace generation and invalidates an older queued run', async () => {
    const first = await workspace()
    const other = await workspace()
    const visitor = await visitorIdentity(new Request('http://localhost', { headers: { Cookie: first.cookie } }), local)
    const queued = await prepareRun(local, visitor.graphName, { kind: 'build', expectedRevision: 0 }, 'queued-before-reset')
    expect((await request('/api/workspace/reset', 'POST', {}, first.cookie)).status).toBe(422)
    const response = await request('/api/workspace/reset', 'POST', { confirmation: 'RESET' }, first.cookie)
    expect(response.status).toBe(200)
    const cookie = response.headers.get('Set-Cookie')!.split(';')[0]
    const next = workspaceSnapshotSchema.parse(await response.json())
    expect(next.workspace.id).not.toBe(first.data.workspace.id)
    expect(next.artifacts).toHaveLength(5)
    expect(next.runs).toEqual([])
    expect((await visitorIdentity(new Request('http://localhost', { headers: { Cookie: cookie } }), local)).id).toBe(visitor.id)
    expect((await request('/api/workspace', 'GET', undefined, first.cookie)).status).toBe(404)
    expect(workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, other.cookie)).json())).toEqual(other.data)
    const old = await withGraph(local, visitor.graphName, (graph) => graph.roQuery<{ status: string }>('MATCH (r:Run {id:$id}) RETURN r.status AS status', { params: { id: queued.id } }))
    expect(old.data).toEqual([{ status: 'obsolete' }])
    await expect(beginRun(local, visitor.graphName, queued.id)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    // A client that lost the reset response can recover with its previous cookie.
    const recovered = await request('/api/workspace', 'POST', {}, first.cookie)
    expect(recovered.status).toBe(200)
    expect(workspaceSnapshotSchema.parse(await recovered.json()).artifacts).toHaveLength(5)
  })
  it('creates an actual empty work session with a bounded label', async () => {
    const { cookie } = await workspace()
    const response = await request('/api/sessions', 'POST', { label: 'Operator review' }, cookie)
    expect(response.status).toBe(201)
    const snapshot = workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, cookie)).json())
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0].label).toBe('Operator review')
    expect(snapshot.artifacts).toHaveLength(5)
  })
  it('rejects an authentically signed but expired visitor cookie', async () => {
    const realNow = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(realNow - 2 * 86_400_000)
    let cookie: string
    try { cookie = (await visitorIdentity(new Request('http://localhost'), local, true)).cookie!.split(';')[0] }
    finally { clock.mockRestore() }
    await expect(visitorIdentity(new Request('http://localhost', { headers: { Cookie: cookie } }), local)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
  it('returns 429 before creating a run when the known inference budget is exhausted', async () => {
    const { cookie } = await workspace()
    const id = `inference:global:${Math.floor(Date.now() / 86_400_000)}`
    await withGraph(local, local.CONTROL_GRAPH!, (graph) => graph.query('MERGE (q:Quota {id:$id}) SET q.count = 400', { params: { id } }))
    const response = await request('/api/runs', 'POST', { kind: 'build', expectedRevision: 0 }, cookie, { 'Idempotency-Key': 'exhausted-budget' })
    expect(response.status).toBe(429)
    expect(workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, cookie)).json()).runs).toEqual([])
  })
  it('rejects malformed JSON and missing same-origin evidence', async () => {
    const response = await app.request('http://localhost/api/workspace', { method: 'POST', body: '{', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' } }, local)
    expect(response.status).toBe(400)
    expect((await request('/api/workspace', 'POST', {}, undefined, { Origin: '' })).status).toBe(403)
  })
  it('deletes only the owned terminal workspace and rotates a lost-response cookie on recovery', async () => {
    const first = await workspace()
    const other = await workspace()
    const old = await visitorIdentity(new Request('http://localhost', { headers: { Cookie: first.cookie } }), local)
    expect((await request('/api/workspace', 'DELETE', {}, first.cookie)).status).toBe(422)
    const response = await request('/api/workspace', 'DELETE', { confirmation: 'DELETE' }, first.cookie)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true })
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect((await request('/api/workspace', 'GET', undefined, first.cookie)).status).toBe(404)
    await expect(withGraph(local, old.graphName, (graph) => graph.roQuery('RETURN 1'))).rejects.toThrow()
    expect(workspaceSnapshotSchema.parse(await (await request('/api/workspace', 'GET', undefined, other.cookie)).json())).toEqual(other.data)
    const recovered = await request('/api/workspace', 'POST', {}, first.cookie)
    expect(recovered.status).toBe(200)
    expect(workspaceSnapshotSchema.parse(await recovered.json()).workspace.id).not.toBe(first.data.workspace.id)
    const cookie = recovered.headers.get('Set-Cookie')!.split(';')[0]
    expect((await visitorIdentity(new Request('http://localhost', { headers: { Cookie: cookie } }), local)).id).toBe(old.id)
  })
  it('refuses deletion while a saved run is active and allows it after failure', async () => {
    const first = await workspace()
    const visitor = await visitorIdentity(new Request('http://localhost', { headers: { Cookie: first.cookie } }), local)
    const run = await prepareRun(local, visitor.graphName, { kind: 'build', expectedRevision: 0 }, 'close-active-workspace')
    expect((await request('/api/workspace', 'DELETE', { confirmation: 'DELETE' }, first.cookie)).status).toBe(409)
    expect((await request('/api/workspace', 'GET', undefined, first.cookie)).status).toBe(200)
    await failRun(local, visitor.graphName, run.id, new Error('test failure'))
    expect((await request('/api/workspace', 'DELETE', { confirmation: 'DELETE' }, first.cookie)).status).toBe(200)
  })
  for (const status of ['errored', 'terminated', 'complete'] as const) it(`recovers the owned polling snapshot when a Workflow is ${status}`, async () => {
    const first = await workspace()
    const visitor = await visitorIdentity(new Request('http://localhost', { headers: { Cookie: first.cookie } }), local)
    await prepareRun(local, visitor.graphName, { kind: 'build', expectedRevision: 0 }, `terminal-poll-${status}`)
    local.BUILD_WORKFLOW = { get: async () => ({ status: async () => ({ status }) }) } as unknown as Env['BUILD_WORKFLOW']
    const response = await request('/api/workspace', 'GET', undefined, first.cookie)
    expect(response.status).toBe(200)
    const snapshot = workspaceSnapshotSchema.parse(await response.json())
    expect(snapshot.workspace.activeRunId).toBeUndefined()
    expect(snapshot.runs[0]).toMatchObject({ status: 'failed', errorCode: status === 'complete' ? 'WORKFLOW_INCOMPLETE' : 'WORKFLOW_FAILED' })
  })
})
