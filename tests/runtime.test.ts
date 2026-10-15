import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import worker from '../worker/index'

describe('Worker health and database readiness', () => {
  it('serves liveness without database credentials', async () => {
    const response = await exports.default.fetch('https://undograph.test/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('reports unavailable readiness when database credentials are missing', async () => {
    const response = await exports.default.fetch('https://undograph.test/api/ready')
    expect(response.status).toBe(503)
    const body = await response.json() as { error: { code: string; message: string; requestId: string } }
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE')
    expect(body.error.requestId).toEqual(expect.any(String))
  })

  it('keeps connection details and passwords out of database failure responses', async () => {
    const context = createExecutionContext()
    const response = await worker.fetch(
      new Request('https://undograph.test/api/ready'),
      {
        ENVIRONMENT: 'local',
        GRAPH_PREFIX: 'undograph_test_',
        FALKORDB_HOST: '127.0.0.1',
        FALKORDB_PORT: '1',
        FALKORDB_TLS: 'false',
        FALKORDB_USERNAME: 'default',
        FALKORDB_PASSWORD: 'sentinel-private-password',
      },
      context,
    )
    await waitOnExecutionContext(context)
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).not.toContain('sentinel-private-password')
    expect(body).not.toContain('127.0.0.1')
    expect(body).not.toContain('redis://')
    expect(body).not.toContain('ECONNREFUSED')
  })

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await exports.default.fetch('https://undograph.test/api/unknown')
    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('application/json')
  })
})
