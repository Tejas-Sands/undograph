import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium } from 'playwright'

const base = 'https://undograph-preview.the-workflow-worker.workers.dev'
const output = resolve('artifacts/custom-demo')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ baseURL: base, viewport: { width: 1600, height: 800 },
  recordVideo: { dir: output, size: { width: 1600, height: 800 } }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const pointer = document.createElement('div')
    pointer.setAttribute('aria-hidden', 'true')
    Object.assign(pointer.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
      width: '22px', height: '22px', left: '10px', top: '10px', borderRadius: '50%',
      border: '2px solid #155b45', background: '#b5e7cf88', boxShadow: '0 2px 6px #0006' })
    document.body.append(pointer)
    addEventListener('mousemove', e => { pointer.style.left = `${e.clientX-11}px`; pointer.style.top = `${e.clientY-11}px` })
    addEventListener('mousedown', () => { pointer.style.background = '#18845a' })
    addEventListener('mouseup', () => { pointer.style.background = '#b5e7cf88' })
  })
})
const page = await context.newPage()
const began = performance.now()
const seconds = () => (performance.now()-began)/1000
const segments = []
const evidence = { baseUrl: base, capturedAt: new Date().toISOString(), origin: 'live',
  description: 'Actual public application, fictional project/research inputs, real Workers AI.', verified: false }
const save = (name, value) => writeFile(`${output}/${name}`, JSON.stringify(value, null, 2)+'\n')
const pause = ms => page.waitForTimeout(ms)
const click = async locator => {
  await locator.scrollIntoViewIfNeeded()
  const r = await locator.boundingBox()
  if (r) await page.mouse.move(r.x+r.width/2, r.y+r.height/2, { steps: 18 })
  await pause(180)
  await locator.click({ delay: 100, timeout: 25_000 })
  await pause(350)
}
const nav = async name => { await click(page.getByRole('link', { name, exact: true })); await pause(400) }
const shot = name => page.screenshot({ path: `${output}/${name}.png` })
const snapshot = async () => {
  const r = await context.request.get('/api/workspace'); assert.equal(r.status(), 200); return r.json()
}
const current = (state, logical) => {
  const a = state.artifacts.find(a => a.isCurrent && a.logicalId === logical)
  assert.ok(a, `Missing ${logical}`); return a
}
const count = (id, value) => page.waitForFunction(({ id, value }) =>
  document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() === value,
{ id, value: String(value) }, { timeout: 120_000 })
const segment = async (id, action, hold=2200) => {
  const item = { id, start: seconds(), end: null }
  segments.push(item); console.log(`BEGIN ${id}`)
  try { await action(item); await pause(hold); await shot(id) }
  finally { item.end = seconds(); await save('segments.json', segments); console.log(`END ${id}: ${(item.end-item.start).toFixed(1)}s`) }
}
const closeInspector = async () => {
  const close = page.getByRole('button', { name: 'Close artifact details', exact: true })
  if (await close.isVisible()) await click(close)
}
const inspect = async id => {
  await closeInspector()
  await click(page.locator('.reply-card').filter({ hasText: `${id} answer` }))
  await page.getByRole('region', { name: 'Artifact details' }).waitFor()
}
const run = async (item, button, countId, value) => {
  await click(page.getByRole('button', { name: button, exact: true }))
  item.waitStart = seconds(); await count(countId, value); item.waitEnd = seconds()
}
let failure
try {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await shot('landing')
  await segment('configure', async () => {
    await click(page.getByRole('link', { name: 'Open workspace', exact: true }))
    await page.getByRole('heading', { name: 'Create your own workspace' }).waitFor()
    await page.getByLabel('Workspace name').fill('Atlas launch review')
    await page.getByLabel('Source 1 text').fill('Atlas launches on December 8. Priya approves the release.')
    await page.getByLabel('Question 1', { exact: true }).fill('When is the Atlas launch?')
    await page.getByLabel('Question 1', { exact: true }).scrollIntoViewIfNeeded()
    await pause(1600)
    await shot('source-selection')
    await click(page.getByRole('button', { name: 'Create live workspace', exact: true }))
    await page.getByRole('heading', { name: 'Your questions', exact: true }).waitFor()
    evidence.seeded = await snapshot()
    assert.equal(evidence.seeded.workspace.mode, 'knowledge')
  }, 2600)
  await segment('build', async item => {
    await run(item, 'Build agent work', 'current-output-count', 5)
    evidence.original = await snapshot()
    assert.equal(evidence.original.sessions.length, 2)
    assert.equal(evidence.original.runs.at(-1).origin, 'live')
    assert.ok(evidence.original.runs.at(-1).modelCalls > 0)
  }, 3000)
  await segment('notes', async () => {
    await click(page.getByRole('button', { name: 'Launch plan', exact: true }))
    await click(page.getByRole('button', { name: /Source notes · Launch plan, version 1/ }).first())
    await page.locator('.source-evidence').scrollIntoViewIfNeeded()
    assert.ok((await page.locator('.source-evidence').innerText()).includes('December 8'))
  }, 3500)
  await segment('answers', async () => {
    await closeInspector(); await nav('Answers'); await inspect('date')
    assert.match(current(evidence.original, 'answer:date').body.text, /8|eighth/i)
    await page.getByRole('region', { name: 'Cited sources', exact: true }).scrollIntoViewIfNeeded()
  }, 3500)
  await segment('memory', async () => {
    await closeInspector(); await nav('Sessions'); await pause(1800)
    await nav('Overview'); await page.reload({ waitUntil: 'networkidle' }); await count('current-output-count', 5)
    assert.deepEqual(await snapshot(), evidence.original)
  }, 1800)
  await segment('correct', async () => {
    await nav('Sources')
    await click(page.locator('.source-card').filter({ hasText: 'Launch plan' }).getByRole('button', { name: 'Correct source text' }))
    await page.getByLabel('Source text', { exact: true }).fill('Atlas launches on December 15. Priya approves the release.')
    await page.getByLabel('Reason for correction').pressSequentially('The release team confirmed the new launch date.', { delay: 28 })
    await pause(1800)
    await click(page.getByRole('button', { name: 'Save correction', exact: true }))
    await count('stale-count', 3); evidence.corrected = await snapshot()
  }, 2500)
  await segment('impact', async () => {
    await nav('Overview'); await page.locator('.graph-canvas').scrollIntoViewIfNeeded(); await pause(2500)
    await page.getByTestId('stale-count').scrollIntoViewIfNeeded()
  }, 2800)
  await segment('blocked', async () => {
    await nav('Answers'); await inspect('date')
    const review = page.getByRole('button', { name: 'Mark reviewed', exact: true })
    await review.scrollIntoViewIfNeeded(); assert.equal(await review.isDisabled(), true)
    const r = await context.request.post(`/api/artifacts/${current(evidence.original, 'answer:date').id}/release`,
      { headers: { Origin: base }, data: { expectedRevision: 1 } })
    assert.equal(r.status(), 409)
    evidence.staleReviewRefusal = { status: r.status(), body: await r.json() }
  }, 3500)
  await segment('repair', async item => {
    await closeInspector(); await nav('Overview')
    await run(item, 'Repair affected work', 'stale-count', 0)
    evidence.repaired = await snapshot()
    assert.equal(evidence.repaired.reports.at(-1).repairedLogicalIds.length, 3)
    assert.deepEqual(current(evidence.original, 'answer:owner'), current(evidence.repaired, 'answer:owner'))
    assert.deepEqual(current(evidence.original, 'notes:owners'), current(evidence.repaired, 'notes:owners'))
  }, 3000)
  await segment('result', async () => {
    await nav('Answers'); await inspect('date')
    assert.match(current(evidence.repaired, 'answer:date').body.text, /15|fifteenth/i)
    await page.getByRole('region', { name: 'Cited sources', exact: true }).scrollIntoViewIfNeeded()
    await pause(1600); await shot('new-citation')
    await inspect('approval'); assert.match(current(evidence.repaired, 'answer:approval').body.text, /Priya/i)
  }, 2500)
  await segment('preserved', async () => {
    await inspect('owner'); await page.locator('.inspector .metadata').scrollIntoViewIfNeeded()
    evidence.preserved = current(evidence.original, 'answer:owner')
    assert.ok(await page.locator('.inspector').getByText(evidence.preserved.contentHash, { exact: true }).isVisible())
  }, 3500)
  await segment('audit', async () => {
    await closeInspector(); await nav('Repair history'); await pause(1500)
    const download = page.waitForEvent('download')
    await click(page.getByRole('button', { name: 'Export audit', exact: true }))
    await (await download).saveAs(`${output}/audit.json`)
  }, 2000)
  await segment('research-setup', async () => {
    await click(page.getByRole('button', { name: 'New workspace', exact: true }))
    await click(page.getByRole('button', { name: 'Research notes', exact: true }))
    await page.getByLabel('Workspace name').fill('Campus ecology')
    await page.getByRole('checkbox', { name: /Start a new workspace and close this one/ }).check()
    await click(page.getByRole('button', { name: 'Create live workspace', exact: true }))
    await page.getByRole('heading', { name: 'Your questions', exact: true }).waitFor()
  }, 1800)
  await segment('research-build', async item => {
    await run(item, 'Build agent work', 'current-output-count', 4)
    evidence.researchOriginal = await snapshot()
    await nav('Answers'); await inspect('species')
    assert.match(current(evidence.researchOriginal, 'answer:species').body.text, /42|forty.two/i)
  }, 2000)
  await segment('research-correct', async () => {
    await closeInspector(); await nav('Sources')
    await click(page.locator('.source-card').filter({ hasText: 'Study notes' }).getByRole('button', { name: 'Correct source text' }))
    await page.getByLabel('Source text', { exact: true }).fill('The garden survey observed 51 butterfly species in June. The survey covered three gardens.')
    await page.getByLabel('Reason for correction').fill('A verified survey correction updates the count.')
    await pause(1200); await click(page.getByRole('button', { name: 'Save correction', exact: true })); await count('stale-count', 2)
  }, 1800)
  await segment('research-repair', async item => {
    await nav('Overview'); await run(item, 'Repair affected work', 'stale-count', 0)
    evidence.researchRepaired = await snapshot()
    assert.equal(evidence.researchRepaired.reports.at(-1).repairedLogicalIds.length, 2)
    assert.deepEqual(current(evidence.researchOriginal, 'answer:method'), current(evidence.researchRepaired, 'answer:method'))
    await nav('Answers'); await inspect('species')
    assert.match(current(evidence.researchRepaired, 'answer:species').body.text, /51|fifty.one/i)
    evidence.verified = true; await save('run-evidence.json', evidence)
  }, 3500)
} catch (error) {
  failure = error; console.error(error.stack)
  await shot('failure').catch(() => {})
  await save('partial-evidence.json', evidence)
  await writeFile(`${output}/failure.txt`, `${error.stack}\n\n${await page.locator('body').innerText().catch(() => '')}`)
} finally {
  const r = await context.request.delete('/api/workspace', { headers: { Origin: base }, data: { confirmation: 'DELETE' } }).catch(() => null)
  console.log(`Owned terminal workspace cleanup: ${r?.status() ?? 'unavailable'}`)
  await save('segments.json', segments)
  const video = page.video()
  await context.close()
  await video.saveAs(`${output}/live-workflow.webm`)
  await browser.close()
}
if (failure) throw failure
console.log('Verified actual project and research capture completed.')
