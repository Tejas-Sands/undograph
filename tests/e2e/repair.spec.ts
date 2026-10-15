import { expect, test } from '@playwright/test'
import { workspaceSnapshotSchema } from '../../shared/contracts'

test('live build, reload, correction, blocked stale review and selective repair', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.UNDOGRAPH_LIVE_AI !== '1',
    'Requires an explicitly enabled real Workers AI connection.',
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Start live workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Build agent work', exact: true }).click()
  await expect(page.getByTestId('current-output-count')).toHaveText('6', { timeout: 90_000 })
  await expect(page.getByTestId('session-count')).toHaveText('2')
  await page.reload()
  await expect(page.getByTestId('current-output-count')).toHaveText('6')
  const before = workspaceSnapshotSchema.parse(
    await (await page.request.get('/api/workspace')).json(),
  )
  const independent = before.artifacts.find((a) => a.logicalId === 'reply:A001' && a.isCurrent)!
  const reply = before.artifacts.find((a) => a.logicalId === 'reply:R021' && a.isCurrent)!
  await page.getByRole('link', { name: 'Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Correct return window', exact: true }).click()
  await page.getByLabel('Return window (days)').fill('14')
  await page
    .getByLabel('Reason for correction')
    .fill('Browser acceptance: operator verified a fourteen-day policy.')
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await expect(page.getByTestId('stale-count')).toHaveText('5')
  const refused = await page.request.post(`/api/artifacts/${reply.id}/release`, {
    data: { expectedRevision: 1 },
    headers: { Origin: baseURL! },
  })
  expect(refused.status()).toBe(409)
  await page.getByRole('button', { name: 'Repair affected work', exact: true }).click()
  await expect(page.getByTestId('stale-count')).toHaveText('0', { timeout: 90_000 })
  await expect(page.getByTestId('current-output-count')).toHaveText('6')
  const after = workspaceSnapshotSchema.parse(
    await (await page.request.get('/api/workspace')).json(),
  )
  expect(after.artifacts.find((a) => a.logicalId === 'reply:A001' && a.isCurrent)).toEqual(
    independent,
  )
  expect(after.reports.at(-1)?.repairedLogicalIds).toHaveLength(5)
  expect(
    after.artifacts.find((a) => a.logicalId === 'assessment:R021' && a.isCurrent)?.body,
  ).toMatchObject({ decision: 'ineligible' })
  expect(
    after.artifacts.find((a) => a.logicalId === 'assessment:R007' && a.isCurrent)?.body,
  ).toMatchObject({ decision: 'eligible' })
  const stranger = await browser.newContext({ baseURL })
  expect((await stranger.request.get(`/api/runs/${after.runs.at(-1)!.id}`)).status()).toBe(404)
  await stranger.close()
  await page.getByRole('link', { name: 'Replies', exact: true }).click()
  await expect(page.getByText('ineligible', { exact: true }).first()).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export audit', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('undograph-audit.json')
})

for (const width of [375, 768, 1024, 1440]) {
  test(`recorded workspace is usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const mutations: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/'))
        mutations.push(request.url())
    })
    await page.goto('/#/recorded/overview')
    await expect(
      page.getByRole('heading', { name: 'Workspace overview', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Recorded walkthrough · Read only', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '02 Corrected', exact: true }).click()
    await expect(page.getByTestId('stale-count')).toHaveText('5')
    await page.getByRole('button', { name: '03 Repaired', exact: true }).click()
    await expect(page.getByTestId('stale-count')).toHaveText('0')
    await expect(page.getByText('Independent reply preserved', { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}.png`), fullPage: true })
    expect(mutations).toEqual([])
  })
}

test('a correction refreshes state after an older workspace read finishes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start live workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Sources', exact: true }).click()
  await page.getByRole('button', { name: 'Correct return window', exact: true }).click()
  let release: () => void = () => {}
  let captured: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const oldReadCaptured = new Promise<void>((resolve) => {
    captured = resolve
  })
  let intercept = true
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() !== 'GET' || !intercept) return route.continue()
    intercept = false
    const response = await route.fetch()
    captured()
    await held
    await route.fulfill({ response })
  })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await oldReadCaptured
  await page.getByLabel('Return window (days)').fill('14')
  await page
    .getByLabel('Reason for correction')
    .fill('Confirmed policy while an earlier read was in flight.')
  const saved = page.waitForResponse(
    (response) => response.url().includes('/corrections') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await (await saved).finished()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  release()
  await expect(page.getByTestId('revision-count')).toHaveText('1')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('the lineage refits after changing from desktop to phone width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/#/recorded/overview')
  await page.getByRole('button', { name: '03 Repaired', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(6)
  await page.setViewportSize({ width: 375, height: 1000 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
        return Array.from(document.querySelectorAll('.react-flow__node')).every((node) => {
          const bounds = node.getBoundingClientRect()
          return (
            bounds.left >= canvas.left &&
            bounds.right <= canvas.right &&
            bounds.top >= canvas.top &&
            bounds.bottom <= canvas.bottom
          )
        })
      }),
    )
    .toBe(true)
})

test('Escape from a correction dialog restores its keyboard trigger', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start live workspace', exact: true }).click()
  await page.getByRole('link', { name: 'Sources', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Correct return window', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('graph artifacts can be inspected and closed using the keyboard', async ({ page }) => {
  await page.goto('/#/recorded/overview')
  const node = page.getByRole('button', { name: 'Returns policy, version 1, Current', exact: true })
  await node.focus()
  await page.keyboard.press('Enter')
  const inspector = page.getByRole('region', { name: 'Artifact details', exact: true })
  await expect(inspector).toBeVisible()
  await expect(
    inspector.getByRole('heading', { name: 'Returns policy', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Close artifact details', exact: true }).click()
  await expect(node).toBeFocused()
})
