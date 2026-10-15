import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

const { values } = parseArgs({ options: { 'base-url': { type: 'string' }, probe: { type: 'boolean' }, benchmark: { type: 'boolean' } } })
if (!values['base-url']) throw new Error('Usage: node scripts/cloud-smoke.mjs --base-url <url>')
const base = new URL(values['base-url'])
if (base.username || base.password || !['http:', 'https:'].includes(base.protocol)) throw new Error('Pass an HTTP(S) URL without credentials.')
const clients = []

function client() {
  const cookies = new Map()
  async function call(path, data, expected = 200, method = data === undefined ? 'GET' : 'POST', headers = {}) {
    const response = await fetch(new URL(path, base), {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Origin: base.origin, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookies.size ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}), ...headers },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0]
      const index = pair.indexOf('=')
      const name = pair.slice(0, index), value = pair.slice(index + 1)
      if (value) cookies.set(name, value)
      else cookies.delete(name)
    }
    const body = await response.json().catch(() => null)
    assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status} (${body?.error?.code ?? 'invalid response'})`)
    return body
  }
  const result = { call, hasCookie: () => cookies.size > 0 }
  clients.push(result)
  return result
}

async function run(visitor, kind, revision) {
  const input = { kind, expectedRevision: revision }
  const key = `smoke-${randomUUID()}`
  let result = await visitor.call('/api/runs', input, 202, 'POST', { 'Idempotency-Key': key })
  const duplicate = await visitor.call('/api/runs', input, 202, 'POST', { 'Idempotency-Key': key })
  assert.equal(duplicate.run.id, result.run.id, 'A duplicate launch must return the same run')
  const deadline = Date.now() + 120_000
  while (['queued', 'running'].includes(result.run.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    result = await visitor.call(`/api/runs/${result.run.id}`)
  }
  assert.equal(result.run.status, 'succeeded', `${kind} run failed or timed out: ${result.run.errorCode ?? result.run.status}`)
  assert.equal(result.run.origin, 'live', 'Recorded output cannot satisfy live verification')
  return result
}

function current(snapshot, logicalId) {
  const artifact = snapshot.artifacts.find((value) => value.logicalId === logicalId && value.isCurrent)
  assert.ok(artifact, `Missing current artifact: ${logicalId}`)
  return artifact
}

function measured(result) {
  const inference = result.steps.filter((step) => step.attempts > 0)
  const sum = (field) => inference.every((step) => step[field] !== undefined) ? inference.reduce((total, step) => total + step[field], 0) : null
  return { runId: result.run.id, modelCalls: result.run.modelCalls, elapsedMs: result.run.completedAt - result.run.createdAt, inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens') }
}

let report

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
  if (values.probe) {
    console.log('Liveness and schema-readiness probe passed. This probe does not verify agent execution or repair.')
  } else {
    const visitor = client()
    const initialized = await visitor.call('/api/workspace', {})
    assert.equal(initialized.artifacts.length, 5, 'Initialization must contain only inputs')
    const built = await run(visitor, 'build', 0)
    const before = await visitor.call('/api/workspace')
    assert.equal(before.sessions.length, 2)
    assert.equal(before.artifacts.filter((artifact) => artifact.isCurrent && !['source', 'case'].includes(artifact.kind)).length, 6)
    assert.deepEqual(await visitor.call('/api/workspace'), before, 'Reopening must recover identical records')
    const source = current(before, 'source:return-policy')
    const account = current(before, 'reply:A001')
    const staleReply = current(before, 'reply:R021')
    const correction = { expectedRevision: 0, returnWindowDays: 14, reason: 'Synthetic smoke verification: confirmed fourteen-day return window.' }
    const impact = await visitor.call(`/api/sources/${source.id}/corrections`, correction)
    assert.equal(impact.complete, true)
    assert.equal(impact.affected.length, 5)
    assert.ok(impact.paths.some((path) => path.length >= 4), 'A source-to-reply multi-hop path must be returned')
    await visitor.call(`/api/sources/${source.id}/corrections`, correction, 409)
    const refused = await visitor.call(`/api/artifacts/${staleReply.id}/release`, { expectedRevision: 1 }, 409)
    assert.equal(refused.error.code, 'STALE_RELEASE')
    const repaired = await run(visitor, 'repair', 1)
    const after = await visitor.call('/api/workspace')
    assert.equal(after.artifacts.filter((artifact) => artifact.isCurrent && artifact.status === 'stale').length, 0)
    assert.equal(repaired.report.repairedLogicalIds.length, 5)
    assert.deepEqual(current(after, 'reply:A001'), account, 'Independent work must retain its complete original record')
    assert.equal(current(after, 'assessment:R021').body.decision, 'ineligible')
    assert.equal(current(after, 'assessment:R007').body.decision, 'eligible')
    const newSource = current(after, 'source:return-policy')
    for (const logicalId of ['reply:R021', 'reply:R007']) assert.ok(current(after, logicalId).body.citations.includes(newSource.id))
    await visitor.call(`/api/artifacts/${current(after, 'reply:R021').id}/release`, { expectedRevision: 1 })
    const audit = await visitor.call('/api/export')
    assert.equal(audit.origin, 'live')
    for (const forbidden of ['SESSION_SECRET', 'FALKORDB_', 'graphName', 'undograph_session=']) assert.ok(!JSON.stringify(audit).includes(forbidden), 'Export contains internal configuration')
    const stranger = client()
    await stranger.call('/api/workspace', {})
    await stranger.call(`/api/runs/${built.run.id}`, undefined, 404)
    report = { baseUrl: base.origin, verified: true, affectedArtifacts: impact.affected.length, repairedArtifacts: repaired.report.repairedLogicalIds.length, preserved: repaired.report.preserved, initialBuild: measured(built), selectiveRepair: measured(repaired) }
    if (values.benchmark) {
      const comparison = client()
      const initial = await comparison.call('/api/workspace', {})
      await comparison.call(`/api/sources/${current(initial, 'source:return-policy').id}/corrections`, correction)
      const full = await run(comparison, 'build', 1)
      const fullSnapshot = await comparison.call('/api/workspace')
      assert.equal(current(fullSnapshot, 'source:return-policy').contentHash, newSource.contentHash, 'The comparison must use the same corrected policy content')
      for (const logicalId of ['case:R-021', 'case:R-007', 'case:A-001']) assert.equal(current(fullSnapshot, logicalId).contentHash, current(after, logicalId).contentHash)
      report.fullRebuildOnCorrectedFixture = measured(full)
    }
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  for (const visitor of clients) {
    if (!visitor.hasCookie()) continue
    try { assert.equal((await visitor.call('/api/workspace', { confirmation: 'DELETE' }, 200, 'DELETE')).deleted, true) }
    catch (error) { console.error(`Owned smoke workspace cleanup failed: ${error.message}`); process.exitCode = 1 }
  }
}
if (report && !process.exitCode) console.log(JSON.stringify({ ...report, cleanup: 'owned terminal workspace graphs deleted' }, null, 2))
