import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError, z } from 'zod'
import { correctionRequestSchema, runRequestSchema } from '../shared/contracts'
import { DomainError, validateLineage } from './domain'
import type { Env } from './env'
import { DatabaseUnavailable, withGraph } from './graph/client'
import { ensureSchema, findImpact, initializeWorkspace, loadSnapshot, queryGraph } from './graph/store'
import { readJson, rotateWorkspace, visitorIdentity } from './identity'
import { cleanupExpiredWorkspaces, controlGraph, registerWorkspace } from './limits'
import { launchRun, loadRun, prepareRun } from './runs'
import { commitCorrection, releaseDraft } from './repair'

export { BuildWorkflow, RepairWorkflow } from './workflows'

export const app = new Hono<{ Bindings: Env }>()

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
  let visitor = await visitorIdentity(context.req.raw, context.env, true)
  await registerWorkspace(context.env, visitor.graphName, visitor.expiresAt)
  let snapshot
  try { snapshot = await initializeWorkspace(context.env, visitor.graphName, visitor.workspaceId, visitor.expiresAt) }
  catch (error) {
    if (!(error instanceof DomainError) || error.code !== 'WORKSPACE_EXPIRED') throw error
    visitor = await rotateWorkspace(context.req.raw, context.env)
    await registerWorkspace(context.env, visitor.graphName, visitor.expiresAt)
    snapshot = await initializeWorkspace(context.env, visitor.graphName, visitor.workspaceId, visitor.expiresAt)
  }
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
  const run = await prepareRun(context.env, visitor.graphName, input, context.req.header('Idempotency-Key') ?? '', visitor.id)
  await launchRun(context.env, visitor.graphName, run, visitor.id)
  return context.json(await loadRun(context.env, visitor.graphName, run.id), 202)
})

app.get('/api/runs/:id', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  return context.json(await loadRun(context.env, visitor.graphName, context.req.param('id')))
})

app.get('/api/artifacts/:id/impact', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  return context.json(await findImpact(context.env, visitor.graphName, context.req.param('id')))
})

app.post('/api/sources/:id/corrections', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  const input = correctionRequestSchema.omit({ sourceArtifactId: true }).strict().parse(await readJson(context.req.raw))
  return context.json(await commitCorrection(context.env, visitor.graphName, { ...input, sourceArtifactId: context.req.param('id') }))
})

app.post('/api/artifacts/:id/release', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  const input = z.object({ expectedRevision: z.number().int().nonnegative() }).strict().parse(await readJson(context.req.raw))
  return context.json(await releaseDraft(context.env, visitor.graphName, context.req.param('id'), input.expectedRevision))
})

app.post('/api/sessions', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  const input = z.object({ label: z.string().trim().min(1).max(80) }).strict().parse(await readJson(context.req.raw))
  const snapshot = await loadSnapshot(context.env, visitor.graphName)
  if (snapshot.sessions.length >= 100) throw new DomainError('SESSION_LIMIT', 'This workspace reached its work-session limit.', 429)
  const id = `session_${crypto.randomUUID().replaceAll('-', '')}`
  const rows = await queryGraph(context.env, visitor.graphName, 'createSession', { id, label: input.label, now: Date.now() })
  if (!rows.length) throw new DomainError('NOT_FOUND', 'Workspace not found.', 404)
  return context.json((await loadSnapshot(context.env, visitor.graphName)).sessions.find((session) => session.id === id)!, 201)
})

app.get('/api/export', async (context) => {
  const visitor = await visitorIdentity(context.req.raw, context.env)
  const snapshot = await loadSnapshot(context.env, visitor.graphName)
  validateLineage(snapshot)
  const sourceId = [...snapshot.changes].sort((a, b) => b.revision - a.revision)[0]?.oldSourceId ?? snapshot.artifacts.find((a) => a.logicalId === 'source:return-policy' && a.isCurrent)?.id
  context.header('Content-Disposition', 'attachment; filename="undograph-audit.json"')
  return context.json({ auditVersion: 1, origin: 'live', exportedAt: Date.now(), snapshot, ...(sourceId ? { impact: await findImpact(context.env, visitor.graphName, sourceId) } : {}) })
})

app.post('/api/workspace/reset', async (context) => {
  z.object({ confirmation: z.literal('RESET') }).strict().parse(await readJson(context.req.raw))
  const previous = await visitorIdentity(context.req.raw, context.env)
  await loadSnapshot(context.env, previous.graphName)
  const next = await rotateWorkspace(context.req.raw, context.env)
  await registerWorkspace(context.env, next.graphName, next.expiresAt)
  const snapshot = await initializeWorkspace(context.env, next.graphName, next.workspaceId, next.expiresAt)
  const expired = await queryGraph(context.env, previous.graphName, 'expireWorkspace', { now: Date.now() })
  if (!expired.length) throw new DomainError('NOT_FOUND', 'The old workspace could not be reset.', 404)
  try { await queryGraph(context.env, controlGraph(context.env), 'expireRegistry', { id: previous.graphName, now: Date.now() }) }
  catch { console.warn('Reset registry expiry update deferred; the previous workspace is already closed.') }
  context.header('Set-Cookie', next.cookie!)
  return context.json(snapshot)
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

export default {
  fetch: app.fetch,
  scheduled(_event, env, context) { context.waitUntil(cleanupExpiredWorkspaces(env)) },
} satisfies ExportedHandler<Env>
