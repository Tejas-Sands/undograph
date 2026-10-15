import { env, exports } from 'cloudflare:workers'
import { FalkorDB } from 'falkordb'
import { describe, expect, it } from 'vitest'
import type { Env } from '../worker/env'
import { DatabaseUnavailable, withGraph } from '../worker/graph/client'
import type { ProbeParams } from './fixtures/graph-probe-worker'

const bindings = env as unknown as Env & { GRAPH_PROBE_WORKFLOW: Workflow<ProbeParams> }
const configured = Boolean(bindings.FALKORDB_HOST && bindings.FALKORDB_PASSWORD)
const graphName = () => `undograph_test_probe_${crypto.randomUUID().replaceAll('-', '')}`

describe.skipIf(!configured)('official FalkorDB client inside workerd with a real local database', () => {
  it('writes idempotently with parameters, returns a three-hop path, and deletes only its disposable graph', async () => {
    const name = graphName()
    const label = 'a quoted value: \' "; MATCH (n) DETACH DELETE n //'
    await withGraph(bindings, name, async (graph) => {
      try {
        const query = `MERGE (a:Probe {id: $a}) SET a.note = $note
          MERGE (b:Probe {id: $b}) MERGE (c:Probe {id: $c}) MERGE (d:Probe {id: $d})
          MERGE (a)-[:NEXT]->(b) MERGE (b)-[:NEXT]->(c) MERGE (c)-[:NEXT]->(d)`
        const options = { params: { a: 'source', b: 'facts', c: 'assessment', d: 'reply', note: label }, TIMEOUT: 2_000 }
        await graph.query(query, options)
        await graph.query(query, options)
        const count = await graph.roQuery<{ count: number }>('MATCH (n:Probe) RETURN count(n) AS count', { TIMEOUT: 2_000 })
        expect(count.data).toEqual([{ count: 4 }])
        const path = await graph.roQuery<{ ids: string[]; note: string }>(
          'MATCH p=(a:Probe {id: $id})-[:NEXT*3]->(:Probe) RETURN [n IN nodes(p) | n.id] AS ids, a.note AS note',
          { params: { id: 'source' }, TIMEOUT: 2_000 },
        )
        expect(path.data).toEqual([{ ids: ['source', 'facts', 'assessment', 'reply'], note: label }])
      } finally {
        await graph.delete()
      }
    })
    await expect(withGraph(bindings, name, (graph) => graph.roQuery('RETURN 1', { TIMEOUT: 2_000 }))).rejects.toThrow()
  })

  it('returns readiness only after the actual database answers', async () => {
    const response = await exports.default.fetch('https://undograph.test/api/ready')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ready: true })
  })

  it('refuses incorrect database credentials', async () => {
    await expect(withGraph({ ...bindings, FALKORDB_PASSWORD: 'deliberately-incorrect-password' }, graphName(), (graph) => graph.query('RETURN 1')))
      .rejects.toBeInstanceOf(DatabaseUnavailable)
  })

  it('rejects plaintext database connections outside local development', async () => {
    await expect(withGraph({ ...bindings, ENVIRONMENT: 'production', FALKORDB_TLS: 'false' }, graphName(), (graph) => graph.query('RETURN 1')))
      .rejects.toBeInstanceOf(DatabaseUnavailable)
  })

  it('names invocation-scoped sockets and closes them when work throws', async () => {
    const name = graphName()
    const monitor = await FalkorDB.connect({
      socket: { host: bindings.FALKORDB_HOST, port: Number(bindings.FALKORDB_PORT), connectTimeout: 5_000 },
      username: bindings.FALKORDB_USERNAME,
      password: bindings.FALKORDB_PASSWORD,
    })
    monitor.on('error', () => {})
    try {
      const connection = await monitor.connection
      await expect(withGraph(bindings, name, async () => {
        const clients = await connection.clientList()
        expect(clients.some((client) => client.name === name)).toBe(true)
        throw new Error('work failed after connection')
      })).rejects.toThrow('work failed after connection')
      await expect.poll(async () => (await connection.clientList()).filter((client) => client.name === name)).toEqual([])
    } finally {
      await monitor.close()
    }
  })

  it('runs a parameterized graph query inside an actual local Workflow step', async () => {
    const id = crypto.randomUUID()
    const instance = await bindings.GRAPH_PROBE_WORKFLOW.create({ id, params: { graphName: graphName(), value: 73 } })
    await expect.poll(async () => (await instance.status()).status).toBe('complete')
    expect((await instance.status()).output).toEqual({ value: 73 })
  })
})
