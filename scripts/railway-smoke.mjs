import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const suffix = randomBytes(6).toString('hex')
const container = `undograph-railway-smoke-${suffix}`
const volume = `${container}-data`
const image = process.env.UNDOGRAPH_RAILWAY_IMAGE ?? 'undograph-railway:test'
const prefix = 'undograph_smoke_'
const graphName = `${prefix}persistence`
const passwordCase = process.env.UNDOGRAPH_RAILWAY_PASSWORD_CASE ?? 'generated'
assert(['generated', 'short', 'quoted'].includes(passwordCase), 'Unknown password test case.')
const password = passwordCase === 'generated' ? randomBytes(32).toString('base64url') :
  passwordCase === 'short' ? randomBytes(9).toString('base64url') : ` spaced "${randomBytes(9).toString('base64url')}" \\ # café 🔐 `
const secret = { FALKORDB_PASSWORD: password, GRAPH_GATEWAY_TOKEN: randomBytes(32).toString('base64url') }
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env: { ...process.env, ...secret }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
let base
const pause = () => new Promise((resolve) => setTimeout(resolve, 300))
async function ready() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) })).ok) return } catch { /* startup/restart */ }
    if (docker('inspect', '--format', '{{.State.Running}}', container) !== 'true') throw new Error('Container stopped before readiness.')
    await pause()
  }
  throw new Error('Container did not become ready within 60 seconds.')
}
const operation = (body, token = secret.GRAPH_GATEWAY_TOKEN) => fetch(`${base}/v1/graph`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
async function query(queryName, params = {}) {
  const response = await operation({ action: 'query', graphName, query: queryName, params })
  assert.equal(response.status, 200)
  return (await response.json()).data
}
try {
  docker('volume', 'create', volume)
  docker('run', '--detach', '--name', container, '--memory=1g', '--cpus=1', '-p', '127.0.0.1::8080', '--env', 'FALKORDB_PASSWORD', '--env', 'GRAPH_GATEWAY_TOKEN', '--env', `GATEWAY_GRAPH_PREFIXES=${prefix}`, '--volume', `${volume}:/data`, image)
  base = `http://${docker('port', container, '8080/tcp')}`
  await ready()
  assert.equal((await operation({ action: 'schema', graphName }, 'wrong')).status, 401)
  assert.equal((await operation({ action: 'query', graphName, query: 'RETURN 1', params: {} })).status, 400)
  assert.equal((await operation({ action: 'schema', graphName: 'undograph_foreign_workspace' })).status, 400)
  assert.equal((await operation({ action: 'schema', graphName })).status, 200)
  const workspaceId = 'persisted-through-container-restart'
  await query('bootstrapWorkspace', { id: workspaceId, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 })
  const checkPersisted = async () => assert((await query('snapshot')).some((row) => row.labels.includes('Workspace') && row.node.id === workspaceId))
  await checkPersisted()
  for (const body of [
    { action: 'openStep', graphName, runId: 'missing-run', stage: 'probe', inputIds: [], analyst: false },
    { action: 'saveOutput', graphName, write: { id: 'probe', logicalId: 'probe', kind: 'source', body: { title: 'Probe', category: 'account-help', text: 'Synthetic probe.' }, inputIds: [], expectedRevision: 1, stage: 'probe', promptVersion: 'v1' }, usage: {} },
  ]) {
    const response = await operation(body)
    assert.equal(response.status, 409)
    assert.equal((await response.json()).error.code, 'REVISION_CONFLICT')
  }
  console.log(`Container readiness, authorization, operation allowlist and persistent write (${passwordCase} password): passed.`)
  console.log('Memory with 1 GiB limit:', docker('stats', '--no-stream', '--format', '{{.MemUsage}}', container))
  docker('stop', '--time', '10', container)
  assert.equal(docker('inspect', '--format', '{{.State.ExitCode}}', container), '0')
  docker('start', container)
  // Docker may allocate a new ephemeral host port on start.
  base = `http://${docker('port', container, '8080/tcp')}`
  await ready()
  await checkPersisted()
  console.log('SIGTERM shutdown and persistent volume recovery: passed.')
  docker('exec', container, 'node', '-e', "const fs=require('node:fs');for(const id of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){try{if(fs.readFileSync('/proc/'+id+'/comm','utf8').trim()==='redis-server')process.kill(Number(id),'SIGTERM')}catch{}}")
  const deadline = Date.now() + 15_000
  while (docker('inspect', '--format', '{{.State.Running}}', container) === 'true' && Date.now() < deadline) await pause()
  assert.equal(docker('inspect', '--format', '{{.State.Running}}', container), 'false')
  assert.equal(docker('inspect', '--format', '{{.State.ExitCode}}', container), '1')
  console.log('Database child failure shuts down the gateway with failure status: passed.')
} finally {
  try { docker('rm', '--force', container) } catch { /* already removed */ }
  try { docker('volume', 'rm', volume) } catch { /* only this test’s unique volume */ }
}
