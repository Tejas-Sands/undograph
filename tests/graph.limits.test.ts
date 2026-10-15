import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Env } from '../worker/env'
import { withGraph } from '../worker/graph/client'
import { ensureSchema } from '../worker/graph/store'
import { cleanupExpiredWorkspaces, registerWorkspace, reserveInference } from '../worker/limits'

const bindings = env as unknown as Env
let local: Env
const allocated: string[] = []
const now = Date.UTC(2026, 9, 15, 12)
describe.skipIf(!bindings.FALKORDB_HOST || !bindings.FALKORDB_PASSWORD)('atomic quotas and registry-scoped cleanup', () => {
  beforeEach(async () => {
    local = { ...bindings, CONTROL_GRAPH: `${bindings.GRAPH_PREFIX}limits_${crypto.randomUUID().replaceAll('-', '')}` }
    await ensureSchema(local, local.CONTROL_GRAPH!)
  })
  afterEach(async () => {
    for (const name of [...allocated.splice(0), local.CONTROL_GRAPH!]) {
      try { await withGraph(local, name, (graph) => graph.delete()) }
      catch (error) { if (!(error instanceof Error) || !/empty key|not exist|unknown graph/i.test(error.message)) throw error }
    }
  })
  it('allows exactly 24 concurrent attempts per visitor hour and renews the next hour', async () => {
    const results = await Promise.allSettled(Array.from({ length: 26 }, () => reserveInference(local, 'visitor', now)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(24)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2)
    await expect(reserveInference(local, 'visitor', now + 3_600_000)).resolves.toBeUndefined()
  })
  it('allows only the remaining global attempt across competing visitors', async () => {
    const id = `inference:global:${Math.floor(now / 86_400_000)}`
    await withGraph(local, local.CONTROL_GRAPH!, (graph) => graph.query('MERGE (q:Quota {id:$id}) SET q.count = 399', { params: { id } }))
    const results = await Promise.allSettled(['one', 'two', 'three'].map((id) => reserveInference(local, id, now)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2)
  })
  it('enforces 100 daily allocations while recovery consumes no allocation', async () => {
    const id = `workspaces:${Math.floor(Date.now() / 86_400_000)}`
    await withGraph(local, local.CONTROL_GRAPH!, (graph) => graph.query('MERGE (q:Quota {id:$id}) SET q.count = 99', { params: { id } }))
    const names = ['a', 'b'].map((letter) => `${bindings.GRAPH_PREFIX}visitor_${letter.repeat(64)}`)
    const results = await Promise.allSettled(names.map((name) => registerWorkspace(local, name, Date.now() + 86_400_000)))
    const winner = results.findIndex((r) => r.status === 'fulfilled')
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expect(registerWorkspace(local, names[winner], Date.now() + 86_400_000)).resolves.toBeUndefined()
  })
  it('deletes only registered, expired visitor graphs in the configured project prefix', async () => {
    const expired = `${bindings.GRAPH_PREFIX}visitor_${crypto.randomUUID().replaceAll('-', '').repeat(2)}`
    const live = `${bindings.GRAPH_PREFIX}visitor_${crypto.randomUUID().replaceAll('-', '').repeat(2)}`
    const unregistered = `${bindings.GRAPH_PREFIX}unregistered_${crypto.randomUUID().replaceAll('-', '')}`
    allocated.push(expired, live, unregistered)
    for (const name of allocated) await withGraph(local, name, (graph) => graph.query('CREATE (:Probe {marker: 42})'))
    await withGraph(local, local.CONTROL_GRAPH!, (graph) => graph.query(`CREATE (:WorkspaceRegistry {id:$expired, expiresAt:$past}),
      (:WorkspaceRegistry {id:$live, expiresAt:$future}), (:WorkspaceRegistry {id:$control, expiresAt:$past}),
      (:WorkspaceRegistry {id:'arbitrary_graph', expiresAt:$past})`, { params: { expired, live, control: local.CONTROL_GRAPH!, past: now - 1, future: now + 86_400_000 } }))
    expect(await cleanupExpiredWorkspaces(local, now)).toEqual({ deleted: 1, skipped: 2 })
    await expect(withGraph(local, expired, (graph) => graph.roQuery('RETURN 1'))).rejects.toThrow()
    for (const name of [live, unregistered]) {
      const result = await withGraph(local, name, (graph) => graph.roQuery<{ marker: number }>('MATCH (p:Probe) RETURN p.marker AS marker'))
      expect(result.data).toEqual([{ marker: 42 }])
    }
  })
})
