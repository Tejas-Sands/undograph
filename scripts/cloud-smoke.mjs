import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { 'base-url': { type: 'string' } } })
if (!values['base-url']) throw new Error('Usage: node scripts/cloud-smoke.mjs --base-url <url>')
const base = new URL(values['base-url'])
if (base.username || base.password) throw new Error('Pass a URL without credentials.')

try {
  for (const [path, expected] of [['/api/health', 'ok'], ['/api/ready', 'ready']]) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000), redirect: 'error' })
    assert.equal(response.status, 200, `${path} must return HTTP 200`)
    assert.equal((await response.json())[expected], true, `${path} returned an unexpected response`)
    console.log(`${path}: passed`)
  }
  const response = await fetch(base, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
  assert.equal(response.status, 200, 'Application document must load')
  assert.match(await response.text(), /<title>UndoGraph<\/title>/)
  console.log('Application document: passed')
  console.log('Liveness and graph-readiness smoke checks passed. These checks do not verify agent repair.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
