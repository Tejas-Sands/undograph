import { expect, test } from '@playwright/test'

test('landing illustration stays local and opens the recorded and live workspaces', async ({ page }) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Agent memory\.\s*With a way back\./)
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
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Agent memory.')
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await expect(page).toHaveURL(/#\/overview$/)
  await expect(page.getByRole('button', { name: 'Start live workspace', exact: true })).toBeVisible()
})

test('landing skip link is readable on focus and moves focus to main content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  const contrast = await skip.evaluate((link) => {
    const style = getComputedStyle(link)
    const luminance = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).reduce((sum, channel, index) => {
      const value = Number(channel) / 255
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      return sum + linear * [0.2126, 0.7152, 0.0722][index]
    }, 0)
    const [dark, light] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b)
    return (light + 0.05) / (dark + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('Enter')
  await expect(page.locator('#landing-main')).toBeFocused()
  await expect(page).toHaveURL(/#landing-main$/)
})

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`landing fits ${width}px with reduced motion`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Agent memory.')
    await expect(page.getByRole('link', { name: 'Explore the demo', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open workspace', exact: true })).toBeVisible()
    const example = page.getByRole('region', { name: 'Interactive correction example' })
    for (const name of ['1. Original', '2. Correct', '3. Repair']) {
      const stage = example.getByRole('button', { name })
      await stage.click()
      await expect(stage).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const clippedLabels = await example.locator('.lp-node-label, .lp-flow-node > strong, .lp-source-value').evaluateAll(
        (labels) => labels.filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent),
      )
      expect(clippedLabels).toEqual([])
    }
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
