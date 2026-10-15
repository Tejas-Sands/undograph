import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError, z } from 'zod'
import { runRequestSchema } from '../shared/contracts'
import { DomainError } from './domain'
import type { Env } from './env'
import { DatabaseUnavailable, withGraph } from './graph/client'
import { ensureSchema, initializeWorkspace, loadSnapshot } from './graph/store'
import { readJson, visitorIdentity } from './identity'
import { registerWorkspace } from './limits'
import { launchRun, loadRun, prepareRun } from './runs'

export { BuildWorkflow } from './workflows'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', async (context, next) => {
  context.header('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) && context.req.header('Origin') !== new URL(context.req.url).origin) {
    throw new DomainError('ORIGIN_REFUSED', 'Mutation requests must originate from this application.', 403)
  }
  await next()
})

app.get('/api/health', (context) => context.json({ ok: true }))

app.post('/api/workspace', async (context) => {
  z.object({}).strict().parse(await readJson(context.req.raw))
  const visitor = await visitorIdentity(context.req.raw, context.env, true)
  await registerWorkspace(context.env, visitor.graphName, visitor.expiresAt)
  const snapshot = await initializeWorkspace(context.env, visitor.graphName, visitor.workspaceId, visitor.expiresAt)
  if (visitor.cookie) context.header('Set-Cookie', visitor.cookie)
  return context.json(snapshot)
})

app.get('/api/workspace', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  return context.json(await loadSnapshot(context.env, visitor.graphName))
})

app.post('/api/runs', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  const input = runRequestSchema.strict().parse(await readJson(context.req.raw))
  const run = await prepareRun(context.env, visitor.graphName, input, context.req.header('Idempotency-Key') ?? '')
  await launchRun(context.env, visitor.graphName, run, visitor.id)
  return context.json(await loadRun(context.env, visitor.graphName, run.id), 202)
})

app.get('/api/runs/:id', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  return context.json(await loadRun(context.env, visitor.graphName, context.req.param('id')))
})

app.get('/api/ready', async (context) => {
  try {
    await ensureSchema(context.env, `${context.env.GRAPH_PREFIX}control`)
    await withGraph(context.env, `${context.env.GRAPH_PREFIX}control`, async (graph) => {
      const reply = await graph.query<{ ok: number }>('RETURN 1 AS ok', { TIMEOUT: 2_000 })
      if (reply.data?.[0]?.ok !== 1) throw new DatabaseUnavailable()
    })
    return context.json({ ready: true })
  } catch {
    return context.json({ error: {
      code: 'DATABASE_UNAVAILABLE',
      message: new DatabaseUnavailable().message,
      requestId: crypto.randomUUID(),
    } }, 503)
  }
})

app.notFound((context) => {
  if (context.req.path.startsWith('/api/')) {
    return context.json({ error: { code: 'NOT_FOUND', message: 'API route not found.', requestId: crypto.randomUUID() } }, 404)
  }
  return context.env.ASSETS?.fetch(context.req.raw) ?? context.text('Not found', 404)
})

app.onError((error, context) => context.json({ error: {
  code: error instanceof DomainError ? error.code : error instanceof ZodError ? 'INVALID_REQUEST' : error instanceof DatabaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
  message: error instanceof DomainError || error instanceof DatabaseUnavailable ? error.message : error instanceof ZodError ? 'The request does not match the required schema.' : 'The request could not be completed.',
  requestId: crypto.randomUUID(),
} }, (error instanceof DomainError ? error.status : error instanceof ZodError ? 422 : error instanceof DatabaseUnavailable ? 503 : 500) as ContentfulStatusCode))

export default app
