import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Env } from '../worker/env'
import { createGateway } from '../gateway/app'
import { serveGateway } from '../gateway/http'
import { deleteGraph, initializeWorkspace, loadSnapshot, queryGraph } from '../worker/graph/store'
import { DatabaseUnavailable } from '../worker/graph/client'

const vars = parseEnv(readFileSync('.dev.vars', 'utf8'))
const database: Env = { ...vars, ENVIRONMENT: 'local', FALKORDB_TLS: 'false', GRAPH_PREFIX: 'undograph_gateway_test_' }
const token = 'test-only-gateway-token-with-at-least-32-characters'
const app = createGateway({ token, prefixes: [database.GRAPH_PREFIX], database })
const name = `${database.GRAPH_PREFIX}${crypto.randomUUID().replaceAll('-', '')}`
const post = (body: unknown, auth = token) => app.request('/v1/graph', { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('authenticated named graph gateway', () => {
  it('rejects missing/wrong tokens, arbitrary Cypher, foreign prefixes and malformed bodies', async () => {
    expect((await post({ action: 'schema', graphName: name }, '')).status).toBe(401)
    expect((await post({ action: 'schema', graphName: name }, 'wrong')).status).toBe(401)
    for (const body of [
      { action: 'query', graphName: name, query: 'MATCH (n) DETACH DELETE n', params: {} },
      { action: 'query', graphName: name, query: 'snapshot', params: {}, cypher: 'RETURN 1' },
      { action: 'schema', graphName: 'undograph_foreign_visitor' },
      { action: 'schema', graphName: `${name}; DROP ALL` },
      { action: 'delete', graphName: 'undograph_gateway_test' },
    ]) expect((await post(body)).status).toBe(400)
    expect((await app.request('/v1/graph', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{broken' })).status).toBe(400)
    expect((await post({ action: 'query', graphName: name, query: 'snapshot', params: { text: 'x'.repeat(70_000) } })).status).toBe(413)
  })

  it('does not expose database error text or credentials', async () => {
    const broken = createGateway({ token, prefixes: [database.GRAPH_PREFIX], database: { ...database, FALKORDB_PASSWORD: 'intentionally-wrong-password' } })
    const response = await broken.request('/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: { code: 'DATABASE_UNAVAILABLE' } })
  })
})

describe('fetch adapter through a real HTTP server and FalkorDB', () => {
  let server: ReturnType<typeof serveGateway>
  let remote: Env
  beforeAll(async () => {
    server = serveGateway(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    remote = { ENVIRONMENT: 'local', GRAPH_PREFIX: database.GRAPH_PREFIX, GRAPH_GATEWAY_URL: `http://127.0.0.1:${address.port}`, GRAPH_GATEWAY_TOKEN: token }
  })
  afterAll(async () => {
    await deleteGraph(database, name).catch(() => {})
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('initializes schema, persists parameterized artifacts, reads and deletes through HTTPS-compatible fetch', async () => {
    const snapshot = await initializeWorkspace(remote, name, 'gateway-workspace', Date.now() + 86_400_000)
    expect(snapshot.artifacts).toHaveLength(5)
    expect((await loadSnapshot(remote, name)).workspace.id).toBe('gateway-workspace')
    expect((await queryGraph(remote, name, 'snapshot')).length).toBeGreaterThan(5)
    await deleteGraph(remote, name)
    await expect(loadSnapshot(remote, name)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('fails closed on unsafe remote HTTP, incomplete settings, invalid auth and foreign graph names', async () => {
    for (const env of [
      { ...remote, ENVIRONMENT: 'production' as const },
      { ...remote, GRAPH_GATEWAY_TOKEN: '' },
      { ...remote, GRAPH_GATEWAY_TOKEN: 'wrong' },
      { ...remote, GRAPH_GATEWAY_URL: 'http://example.com' },
      { ...remote, GRAPH_GATEWAY_URL: remote.GRAPH_GATEWAY_URL + '?secret=bad' },
    ]) await expect(queryGraph(env, name, 'snapshot')).rejects.toBeInstanceOf(DatabaseUnavailable)
    await expect(queryGraph(remote, 'undograph_other_graph', 'snapshot')).rejects.toThrow()
  })

  it('rejects redirects without forwarding the bearer token and rejects malformed replies', async () => {
    let captured = 0
    const hostile = new Hono()
    hostile.post('/v1/graph', (context) => context.redirect('/capture', 307))
    hostile.post('/capture', (context) => { captured++; return context.json({ data: [] }) })
    const redirect = serveGateway(hostile)
    await new Promise<void>((resolve) => redirect.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${(redirect.address() as { port: number }).port}`
      await expect(queryGraph({ ...remote, GRAPH_GATEWAY_URL: url }, name, 'snapshot')).rejects.toBeInstanceOf(DatabaseUnavailable)
      expect(captured).toBe(0)
    } finally { await new Promise<void>((resolve) => redirect.close(() => resolve())) }
    const malformed = serveGateway(new Hono().post('/v1/graph', (context) => context.json({ data: 'not-an-array' })))
    await new Promise<void>((resolve) => malformed.listen(0, '127.0.0.1', resolve))
    try {
      const url = `http://127.0.0.1:${(malformed.address() as { port: number }).port}`
      await expect(queryGraph({ ...remote, GRAPH_GATEWAY_URL: url }, name, 'snapshot')).rejects.toBeInstanceOf(DatabaseUnavailable)
    } finally { await new Promise<void>((resolve) => malformed.close(() => resolve())) }
  })
})
