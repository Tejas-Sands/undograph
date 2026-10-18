import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { artifactWriteSchema, jsonSchema } from '../shared/contracts'
import { DomainError } from '../worker/domain'
import { logAttempt, openStep, saveOutput } from '../worker/runs'
import type { Env } from '../worker/env'
import { withGraph } from '../worker/graph/client'
import { queries, type QueryName } from '../worker/graph/queries'
import { deleteGraph, ensureSchema, queryGraph } from '../worker/graph/store'

export interface GatewayConfig { token: string; prefixes: string[]; database: Env }
const graphName = z.string().max(160).regex(/^undograph_[a-zA-Z0-9_]+$/)
const id = z.string().min(1).max(160)
const operation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('query'), graphName, query: z.enum(Object.keys(queries) as [QueryName, ...QueryName[]]), params: z.record(z.string(), jsonSchema) }).strict(),
  z.object({ action: z.literal('schema'), graphName }).strict(),
  z.object({ action: z.literal('delete'), graphName }).strict(),
  z.object({ action: z.literal('openStep'), graphName, runId: id, stage: z.string().min(1).max(120), inputIds: z.array(id).max(32), analyst: z.boolean() }).strict(),
  z.object({ action: z.literal('saveOutput'), graphName, write: artifactWriteSchema.strict(), usage: z.object({ inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional() }).strict() }).strict(),
  z.object({ action: z.literal('logAttempt'), graphName, controlGraph: graphName, visitorId: id, runId: id, stage: z.string().min(1).max(120) }).strict(),
])
const missingGraph = (error: unknown) => error instanceof Error && /empty key|unknown graph|graph.*does not exist/i.test(error.message)

export function createGateway(config: GatewayConfig) {
  if (config.token.length < 32 || !config.prefixes.length || config.prefixes.some((prefix) => !/^undograph_[a-zA-Z0-9]+[a-zA-Z0-9_]*_$/.test(prefix))) throw new Error('Configure a strong gateway token and explicit graph prefixes.')
  if (config.database.GRAPH_GATEWAY_URL || config.database.GRAPH_GATEWAY_TOKEN) throw new Error('Gateway database configuration must use a direct connection.')
  const app = new Hono()
  app.use('*', async (context, next) => { context.header('Cache-Control', 'no-store'); await next() })
  app.get('/health', async (context) => {
    const env = { ...config.database, GRAPH_PREFIX: config.prefixes[0] }
    await withGraph(env, `${env.GRAPH_PREFIX}health`, async (graph) => { await graph.query('RETURN 1 AS ready', { TIMEOUT: 2_000 }) })
    return context.json({ ready: true })
  })
  app.use('/v1/*', async (context, next) => {
    const supplied = Buffer.from(context.req.header('Authorization') ?? '')
    const expected = Buffer.from(`Bearer ${config.token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return context.json({ error: { code: 'UNAUTHORIZED' } }, 401)
    await next()
  })
  app.use('/v1/*', bodyLimit({ maxSize: 65_536, onError: (context) => context.json({ error: { code: 'BODY_TOO_LARGE' } }, 413) }))
  app.post('/v1/graph', async (context) => {
    let body: unknown
    try { body = await context.req.json() } catch { return context.json({ error: { code: 'INVALID_REQUEST' } }, 400) }
    const result = operation.safeParse(body)
    if (!result.success) return context.json({ error: { code: 'INVALID_REQUEST' } }, 400)
    const input = result.data
    const prefix = config.prefixes.find((entry) => input.graphName.startsWith(entry))
    if (!prefix) return context.json({ error: { code: 'INVALID_GRAPH' } }, 400)
    if (input.action === 'logAttempt' && !input.controlGraph.startsWith(prefix)) return context.json({ error: { code: 'INVALID_GRAPH' } }, 400)
    const env = { ...config.database, GRAPH_PREFIX: prefix }
    if (input.action === 'query') return context.json({ data: await queryGraph(env, input.graphName, input.query, input.params) })
    if (input.action === 'openStep') return context.json({ data: await openStep(env, input.graphName, input.runId, input.stage, input.inputIds, input.analyst) })
    if (input.action === 'saveOutput') return context.json({ data: await saveOutput(env, input.graphName, input.write, input.usage) })
    if (input.action === 'logAttempt') { await logAttempt({ ...env, CONTROL_GRAPH: input.controlGraph }, input.graphName, input.visitorId, input.runId, input.stage); return context.json({ data: null }) }
    if (input.action === 'schema') await ensureSchema(env, input.graphName)
    else {
      try { await deleteGraph(env, input.graphName) } catch (error) { if (!missingGraph(error)) throw error }
    }
    return context.json({ data: null })
  })
  app.onError((error, context) => error instanceof DomainError
    ? context.json({ error: { code: error.code, message: error.message } }, error.status as ContentfulStatusCode)
    : missingGraph(error)
    ? context.json({ error: { code: 'NOT_FOUND' } }, 404)
    : context.json({ error: { code: 'DATABASE_UNAVAILABLE' } }, 503))
  app.notFound((context) => context.json({ error: { code: 'ROUTE_NOT_FOUND' } }, 404))
  return app
}
