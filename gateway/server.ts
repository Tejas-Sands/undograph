import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createGateway } from './app'
import { serveGateway } from './http'

const password = process.env.FALKORDB_PASSWORD ?? ''
const token = process.env.GRAPH_GATEWAY_TOKEN ?? ''
const prefixes = (process.env.GATEWAY_GRAPH_PREFIXES ?? 'undograph_preview_').split(',').map((value) => value.trim())
const port = Number(process.env.PORT ?? 8080)
if (!/^[a-zA-Z0-9_-]{32,128}$/.test(password)) throw new Error('FALKORDB_PASSWORD must contain 32–128 random URL-safe characters.')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
const app = createGateway({ token, prefixes, database: {
  ENVIRONMENT: 'local', GRAPH_PREFIX: prefixes[0], FALKORDB_HOST: '127.0.0.1', FALKORDB_PORT: '6379',
  FALKORDB_TLS: 'false', FALKORDB_USERNAME: 'default', FALKORDB_PASSWORD: password,
} })

mkdirSync('/data', { recursive: true })
// Feed the password through stdin rather than exposing it in process arguments.
const database = spawn('redis-server', ['-'], { stdio: ['pipe', 'inherit', 'inherit'] })
database.stdin.on('error', () => {})
database.stdin.end([
  'bind 127.0.0.1', 'port 6379', 'protected-mode yes', `requirepass ${password}`,
  'loadmodule /var/lib/falkordb/bin/falkordb.so', 'dir /data', 'appendonly yes', 'appendfsync everysec',
  'maxmemory 256mb', 'maxmemory-policy noeviction', 'save ""',
].join('\n') + '\n')
const server = serveGateway(app)
let stopping = false
function stop(code: number) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  const exited = database.exitCode !== null || database.signalCode !== null ? Promise.resolve() : new Promise<void>((resolve) => database.once('exit', () => resolve()))
  database.kill('SIGTERM')
  const timeout = setTimeout(() => { database.kill('SIGKILL'); process.exit(code || 1) }, 8_000)
  void Promise.all([closed, exited]).then(() => { clearTimeout(timeout); process.exit(code) })
}
database.on('error', () => { console.error('FalkorDB could not start.'); stop(1) })
database.on('exit', () => { if (!stopping) { console.error('FalkorDB stopped unexpectedly.'); stop(1) } })
server.on('error', () => { console.error('Gateway could not listen.'); stop(1) })
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
server.listen(port, '0.0.0.0', () => console.log(`UndoGraph gateway listening on ${port}.`))
