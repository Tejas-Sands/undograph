import { env } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../worker/index'
import { runResultSchema, workspaceSnapshotSchema } from '../shared/contracts'
import type { Env } from '../worker/env'
import { ensureSchema } from '../worker/graph/store'
import { withGraph } from '../worker/graph/client'

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

describe('owned local build API', () => {
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
})
