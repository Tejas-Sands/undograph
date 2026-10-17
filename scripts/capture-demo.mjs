import assert from 'node:assert/strict'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium } from 'playwright'

const base = process.env.UNDOGRAPH_BASE_URL ?? 'https://undograph-preview.the-workflow-worker.workers.dev'
const output = resolve(process.env.UNDOGRAPH_CAPTURE_DIR ?? 'artifacts/live-demo')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: output, size: { width: 1600, height: 1000 } },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  // A visible cursor makes the real pointer movement legible in the recording.
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div')
    cursor.setAttribute('aria-hidden', 'true')
    Object.assign(cursor.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', width: '24px', height: '24px', left: '18px', top: '18px', borderRadius: '50%', border: '2px solid #125b43', background: '#b5e7cf99', boxShadow: '0 1px 5px #0007' })
    document.body.append(cursor)
    addEventListener('mousemove', event => { cursor.style.left = `${event.clientX - 12}px`; cursor.style.top = `${event.clientY - 12}px` })
    addEventListener('mousedown', () => { cursor.style.background = '#13805a' })
    addEventListener('mouseup', () => { cursor.style.background = '#b5e7cf99' })
  })
})
const page = await context.newPage()
const began = performance.now()
const seconds = () => (performance.now() - began) / 1000
const segments = []
const evidence = { origin: 'recorded', description: 'Fresh recording of actual public-app operation and real inference with synthetic inputs.', capturedAt: new Date().toISOString(), baseUrl: base }
const pause = ms => page.waitForTimeout(ms)
const save = (name, value) => writeFile(`${output}/${name}`, JSON.stringify(value, null, 2) + '\n')
const click = async locator => {
  await locator.scrollIntoViewIfNeeded()
  const rect = await locator.boundingBox()
  if (rect) await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 18 })
  await pause(250)
  await locator.click({ delay: 120, timeout: 30_000 })
}
const navigate = async name => {
  await click(page.getByRole('link', { name, exact: true }))
  await pause(700)
}
const snapshot = async () => {
  const response = await context.request.get('/api/workspace')
  assert.equal(response.status(), 200)
  return response.json()
}
const current = (state, logicalId) => {
  const artifact = state.artifacts.find(value => value.isCurrent && value.logicalId === logicalId)
  assert.ok(artifact, `Missing ${logicalId}`)
  return artifact
}
const count = async (id, value) => page.waitForFunction(({ id, value }) =>
  document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() === value,
{ id, value }, { timeout: 120_000 })
const shot = async name => {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
  await save('segments.json', segments)
}
const segment = async (id, title, action, hold = 2200) => {
  const item = { id, title, start: seconds(), end: null }
  segments.push(item)
  console.log(`BEGIN ${id}`)
  try {
    await action(item)
    await pause(hold)
    await shot(id)
  } finally {
    item.end = seconds()
    await save('segments.json', segments)
    console.log(`END ${id}: ${(item.end - item.start).toFixed(1)}s`)
  }
}
const inspectReply = async ticket => {
  await click(page.locator('.reply-card').filter({ hasText: `${ticket} reply` }))
  await page.getByRole('region', { name: 'Artifact details' }).waitFor({ state: 'visible' })
  await page.locator('.inspector').scrollIntoViewIfNeeded()
  await pause(600)
}
let created = false
let failure
try {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await segment('entry', 'Open the public application', async () => {
    await click(page.getByRole('link', { name: 'Open workspace', exact: true }))
    await page.getByRole('button', { name: 'Start live workspace', exact: true }).waitFor()
  })
  await segment('initialize', 'Create an isolated live workspace', async () => {
    await click(page.getByRole('button', { name: 'Start live workspace', exact: true }))
    created = true
    await page.getByRole('button', { name: 'Build agent work', exact: true }).waitFor()
    evidence.seeded = await snapshot()
    assert.equal(evidence.seeded.artifacts.length, 5)
  })
  await segment('build', 'Generate real agent work', async item => {
    await click(page.getByRole('button', { name: 'Build agent work', exact: true }))
    item.waitStart = seconds()
    await count('current-output-count', '6')
    item.waitEnd = seconds()
    evidence.original = await snapshot()
    assert.equal(evidence.original.sessions.length, 2)
  }, 3500)
  await segment('memory', 'Inspect durable work sessions and reload', async () => {
    await navigate('Sessions')
    await pause(2500)
    await navigate('Overview')
    await page.reload({ waitUntil: 'networkidle' })
    await count('current-output-count', '6')
    assert.deepEqual(await snapshot(), evidence.original)
  })
  await segment('original-reply', 'Inspect the original return decision', async () => {
    await navigate('Replies')
    await inspectReply('R-021')
    assert.equal(current(evidence.original, 'assessment:R021').body.decision, 'eligible')
  }, 3500)
  await segment('original-account', 'Record the independent reply before correction', async () => {
    await inspectReply('A-001')
    await page.locator('.inspector .metadata').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  }, 3200)
  await segment('correct', 'Correct the source from thirty to fourteen days', async () => {
    await navigate('Sources')
    await click(page.getByRole('button', { name: 'Correct return window', exact: true }))
    await pause(1000)
    await page.getByLabel('Return window (days)').fill('14')
    await page.getByLabel('Reason for correction').pressSequentially('Operator confirmed the fourteen-day return policy.', { delay: 35 })
    await pause(1900)
    await click(page.getByRole('button', { name: 'Save correction', exact: true }))
    await count('stale-count', '5')
    evidence.corrected = await snapshot()
  }, 3000)
  await segment('impact', 'Inspect the five stale outputs and dependency graph', async () => {
    await navigate('Overview')
    await page.locator('.graph-canvas').scrollIntoViewIfNeeded()
    await pause(2000)
    await page.getByTestId('stale-count').scrollIntoViewIfNeeded()
  }, 3500)
  await segment('blocked-review', 'Show that stale evidence cannot be approved', async () => {
    await navigate('Replies')
    await inspectReply('R-021')
    const button = page.getByRole('button', { name: 'Mark reviewed', exact: true })
    await button.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    assert.equal(await button.isDisabled(), true)
    const response = await context.request.post(`/api/artifacts/${current(evidence.original, 'reply:R021').id}/release`, {
      headers: { Origin: new URL(base).origin }, data: { expectedRevision: 1 },
    })
    assert.equal(response.status(), 409)
    evidence.staleReviewRefusal = { status: response.status(), body: await response.json() }
    assert.equal(evidence.staleReviewRefusal.body.error.code, 'STALE_RELEASE')
  }, 4000)
  await segment('repair', 'Repair the affected work with real inference', async item => {
    await navigate('Overview')
    await click(page.getByRole('button', { name: 'Repair affected work', exact: true }))
    item.waitStart = seconds()
    await count('stale-count', '0')
    item.waitEnd = seconds()
    await count('current-output-count', '6')
    evidence.repaired = await snapshot()
    assert.equal(evidence.repaired.reports.at(-1).repairedLogicalIds.length, 5)
    assert.deepEqual(current(evidence.repaired, 'reply:A001'), current(evidence.original, 'reply:A001'))
  }, 3500)
  await segment('outcomes', 'Inspect both corrected return decisions', async () => {
    await navigate('Replies')
    await inspectReply('R-021')
    assert.equal(current(evidence.repaired, 'assessment:R021').body.decision, 'ineligible')
    await pause(3500)
    await inspectReply('R-007')
    assert.equal(current(evidence.repaired, 'assessment:R007').body.decision, 'eligible')
  }, 3500)
  await segment('preservation', 'Verify the preserved ID and content hash', async () => {
    await navigate('Overview')
    const preserved = page.locator('.preserved-card').filter({ hasText: 'Independent reply preserved' })
    await click(preserved)
    await page.locator('.inspector .metadata').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await pause(1600)
    assert.ok(await page.locator('.inspector').getByText(current(evidence.original, 'reply:A001').contentHash, { exact: true }).isVisible())
  }, 4000)
  await segment('history', 'Inspect the actual repair report', async () => {
    await navigate('Repair history')
  }, 3500)
  await segment('export', 'Download the live audit evidence', async () => {
    const downloadPromise = page.waitForEvent('download')
    await click(page.getByRole('button', { name: 'Export audit', exact: true }))
    const download = await downloadPromise
    assert.equal(download.suggestedFilename(), 'undograph-audit.json')
    await download.saveAs(`${output}/audit.json`)
    evidence.verified = true
    await save('run-evidence.json', evidence)
    await navigate('Overview')
    await page.getByTestId('current-output-count').scrollIntoViewIfNeeded()
  }, 3500)
} catch (error) {
  failure = error
  console.error(error.stack)
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(`${output}/failure.txt`, `${error.stack}\n\n${await page.locator('body').innerText().catch(() => '')}`)
  await save('partial-evidence.json', evidence)
} finally {
  await save('segments.json', segments)
  if (created) {
    const response = await context.request.delete('/api/workspace', {
      headers: { Origin: new URL(base).origin }, data: { confirmation: 'DELETE' },
    }).catch(() => null)
    console.log(`Owned workspace cleanup: ${response?.status() ?? 'unavailable'}`)
  }
  const video = page.video()
  await context.close()
  if (video) await copyFile(await video.path(), `${output}/live-workflow.webm`)
  await browser.close()
}
if (failure) throw failure
console.log('Actual public build/correction/repair capture passed, including reload, blocked stale approval, preservation and export.')
