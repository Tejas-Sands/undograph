import { Hono } from 'hono'
import type { Env } from './env'
import { DatabaseUnavailable, withGraph } from './graph/client'
import { ensureSchema } from './graph/store'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', async (context, next) => {
  context.header('Cache-Control', 'no-store')
  await next()
})

app.get('/api/health', (context) => context.json({ ok: true }))

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

app.onError((_error, context) => context.json({ error: {
  code: 'INTERNAL_ERROR',
  message: 'The request could not be completed.',
  requestId: crypto.randomUUID(),
} }, 500))

export default app
