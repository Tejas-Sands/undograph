import { DomainError } from '../domain'
import type { Env } from '../env'
import { DatabaseUnavailable } from './client'
import type { QueryName, QueryParams } from './queries'

export type GraphOperation =
  | { action: 'query'; graphName: string; query: QueryName; params: QueryParams }
  | { action: 'schema' | 'delete'; graphName: string }

export function usesGateway(env: Env) {
  return env.GRAPH_GATEWAY_URL !== undefined || env.GRAPH_GATEWAY_TOKEN !== undefined
}

export async function gatewayOperation<T>(env: Env, operation: GraphOperation): Promise<T> {
  let url: URL
  try { url = new URL(env.GRAPH_GATEWAY_URL ?? '') } catch { throw new DatabaseUnavailable() }
  const local = env.ENVIRONMENT === 'local' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
    !env.GRAPH_GATEWAY_TOKEN) throw new DatabaseUnavailable()
  if (!/^undograph_[a-zA-Z0-9_]+$/.test(operation.graphName) || !operation.graphName.startsWith(env.GRAPH_PREFIX)) throw new Error('Invalid server-derived graph name.')
  try {
    const response = await fetch(new URL('/v1/graph', url), {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${env.GRAPH_GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    })
    if (response.status === 404) throw new DomainError('NOT_FOUND', 'Workspace not found.', 404)
    if (!response.ok) throw new DatabaseUnavailable()
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('data' in body)) throw new DatabaseUnavailable()
    const data = body.data
    if (operation.action === 'query' && !Array.isArray(data)) throw new DatabaseUnavailable()
    if (operation.action !== 'query' && data !== null) throw new DatabaseUnavailable()
    return data as T
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DatabaseUnavailable()
  }
}
