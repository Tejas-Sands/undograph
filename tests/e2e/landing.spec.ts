import { expect, test } from '@playwright/test'

test('landing illustration stays local and opens the recorded and live workspaces', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Context changes.Keep the right work.')
  await expect(page.getByText('Interactive illustration · Synthetic example')).toBeVisible()
  const example = page.getByRole('region', { name: 'Interactive correction example' })
  await expect(example.getByText('30 days', { exact: true })).toBeVisible()
  await example.getByRole('button', { name: '2. Correct' }).focus()
  await page.keyboard.press('Enter')
  await expect(example.getByRole('status')).toContainText('5 artifacts need repair')
  await example.getByRole('button', { name: '3. Repair' }).click()
  await expect(example.getByRole('status')).toContainText('5 artifacts repaired')
  await expect(example.getByText('Not eligible', { exact: true })).toBeVisible()
  await expect(example.getByText('v1 · unchanged')).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click()
  await expect(page).toHaveURL(/#how-it-works$/)
  await expect(page.getByRole('heading', { name: 'One correction. A complete chain of evidence.' })).toBeVisible()
  await page.getByRole('link', { name: 'Explore the demo', exact: true }).click()
  await expect(page.getByText('Recorded walkthrough · Read only', { exact: true })).toBeVisible()
  await expect(page.getByTestId('current-output-count')).toHaveText('6')
  expect(apiRequests).toEqual([])
  await page.getByRole('link', { name: 'UndoGraph home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Context changes.')
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await expect(page).toHaveURL(/#\/overview$/)
  await expect(page.getByRole('button', { name: 'Start live workspace', exact: true })).toBeVisible()
})

for (const width of [375, 768, 1024, 1440]) {
  test(`landing fits ${width}px with reduced motion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Context changes.')
    await expect(page.getByRole('link', { name: 'Explore the demo', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open workspace', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: true })
  })
}

test('entering the workspace moves keyboard focus to its content', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Open the recorded demo', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workspace overview', exact: true })).toBeVisible()
  await expect(page.locator('#workspace-main')).toBeFocused({ timeout: 1500 })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
