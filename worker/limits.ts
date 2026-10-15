import { DomainError, hashCanonical } from './domain'
import type { Env } from './env'
import { ensureSchema, queryGraph } from './graph/store'

export function controlGraph(env: Env) { return env.CONTROL_GRAPH ?? `${env.GRAPH_PREFIX}control` }

export async function reserveInference(env: Env, visitorId: string, now = Date.now()): Promise<void> {
  const graphName = controlGraph(env)
  await ensureSchema(env, graphName)
  const hour = Math.floor(now / 3_600_000)
  const day = Math.floor(now / 86_400_000)
  const visitor = await hashCanonical(visitorId)
  const result = await queryGraph(env, graphName, 'reserveInference', {
    visitorBucket: `inference:${visitor}:${hour}`, globalBucket: `inference:global:${day}`,
    hourExpiry: (hour + 1) * 3_600_000, dayExpiry: (day + 1) * 86_400_000,
  })
  if (!result.length) throw new DomainError('INFERENCE_LIMIT', 'Live inference limit reached. Try again later or open the recorded walkthrough.', 429)
}

export async function registerWorkspace(env: Env, graphName: string, expiresAt: number): Promise<void> {
  const control = controlGraph(env)
  await ensureSchema(env, control)
  const day = Math.floor(Date.now() / 86_400_000)
  const result = await queryGraph(env, control, 'registerWorkspace', {
    graphName, expiresAt, dayBucket: `workspaces:${day}`, dayExpiry: (day + 1) * 86_400_000,
  })
  if (!result.length) throw new DomainError('WORKSPACE_LIMIT', 'Today’s workspace limit has been reached. The recorded walkthrough remains available.', 429)
}
