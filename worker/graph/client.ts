import { FalkorDB, type Graph } from 'falkordb'
import type { Env } from '../env'

export class DatabaseUnavailable extends Error {
  constructor() {
    super('The graph database is unavailable. Check the server-side configuration and try again.')
    this.name = 'DatabaseUnavailable'
  }
}

export async function withGraph<T>(
  env: Env,
  graphName: string,
  work: (graph: Graph) => Promise<T>,
): Promise<T> {
  const host = env.FALKORDB_HOST
  const password = env.FALKORDB_PASSWORD
  const port = Number(env.FALKORDB_PORT ?? '6379')
  const tls = env.FALKORDB_TLS !== 'false'
  const isLocal = env.ENVIRONMENT === 'local' && (host === '127.0.0.1' || host === 'localhost')
  if (!host || !password || !Number.isInteger(port) || port < 1 || port > 65535 || (!tls && !isLocal)) {
    throw new DatabaseUnavailable()
  }
  if (!/^undograph_[a-zA-Z0-9_]+$/.test(graphName) || !env.GRAPH_PREFIX.startsWith('undograph_') || !graphName.startsWith(env.GRAPH_PREFIX)) {
    throw new Error('Invalid server-derived graph name.')
  }

  const commonSocket = { host, port, connectTimeout: 5_000, reconnectStrategy: false as const }
  const options = {
    name: graphName,
    socket: tls
      ? { ...commonSocket, tls: true as const, rejectUnauthorized: true }
      : { ...commonSocket, tls: false as const },
    username: env.FALKORDB_USERNAME ?? 'default',
    password,
    commandOptions: { timeout: 5_000 },
  }
  let client: FalkorDB
  try {
    client = await FalkorDB.connect(options)
  } catch {
    throw new DatabaseUnavailable()
  }
  client.on('error', () => {})
  try {
    return await work(client.selectGraph(graphName))
  } finally {
    await client.close().catch(() => {})
  }
}
