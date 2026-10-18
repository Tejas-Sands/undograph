import { expect, test } from '@playwright/test'
import { workspaceSnapshotSchema } from '../../shared/contracts'
import { projectExample, researchExample } from '../../shared/knowledge'

test.afterEach(async ({ page, baseURL }) => {
  if (!process.env.UNDOGRAPH_BASE_URL) return
  const response = await page.request.get('/api/workspace')
  if (!response.ok()) return
  const snapshot = workspaceSnapshotSchema.parse(await response.json())
  if (snapshot.workspace.activeRunId) return
  const deleted = await page.request.delete('/api/workspace', { data: { confirmation: 'DELETE' }, headers: { Origin: baseURL! } })
  expect(deleted.status()).toBe(200)
})

test('judges enter sources/questions, reopen their workspace and correct their own text', async ({ page }, testInfo) => {
  await page.goto('/#/overview')
  await expect(page.getByRole('heading', { name: 'Create your own workspace' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toContainText('Your workspace')
  await page.getByLabel('Workspace name').fill('Judge project notes')
  await page.getByLabel('Source 1 title').fill('Launch plan')
  await page.getByLabel('Source 1 text').fill('The launch is December 8. Noor approves it.')
  await page.getByLabel('Question 1', { exact: true }).fill('When is the launch?')
  await page.getByRole('button', { name: 'Create live workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your questions' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toContainText('Judge project notes')
  await page.reload()
  await expect(page.locator('.breadcrumb')).toContainText('Judge project notes')
  await page.getByRole('link', { name: 'Sources', exact: true }).click()
  const first = page.locator('.source-card').filter({ hasText: 'Launch plan' })
  await expect(first).toContainText('The launch is December 8.')
  await first.getByRole('button', { name: 'Correct source text' }).click()
  await page.getByLabel('Source text', { exact: true }).fill('The launch is December 15. Noor approves it.')
  await page.getByLabel('Reason for correction').fill('Judge verifies a new launch date.')
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await expect(first).toContainText('The launch is December 15.')
  await expect(page.getByTestId('revision-count')).toHaveText('1')
  await page.screenshot({ path: testInfo.outputPath('custom-workspace.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export audit', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('undograph-audit.json')
})

test('a question must select a source and the input form fits a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/overview')
  await page.getByRole('button', { name: 'Project notes', exact: true }).click()
  await page.getByRole('group', { name: 'Question 1 sources' }).getByRole('checkbox').first().uncheck()
  await page.getByRole('button', { name: 'Create live workspace', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Select at least one source')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('custom-form-mobile.png'), fullPage: true })
})

test('live setup lets returning visitors resume or explicitly replace their saved support workspace', async ({ page }, testInfo) => {
  await page.goto('/#/setup')
  await page.getByRole('button', { name: 'Load support example', exact: true }).click()
  await expect(page.locator('.breadcrumb')).toContainText('Northstar Goods')
  const before = workspaceSnapshotSchema.parse(await (await page.request.get('/api/workspace')).json())
  await page.getByRole('link', { name: 'UndoGraph home', exact: true }).click()
  const writes: string[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET') writes.push(request.url())
  })
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click()
  await expect(page).toHaveURL(/#\/setup$/)
  await expect(page.getByRole('heading', { name: 'Set up your workspace', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create your own workspace' })).toBeVisible()
  await expect(page.getByLabel('Workspace name')).toHaveValue('')
  await expect(page.getByLabel('Source 1 text')).toHaveValue('')
  await expect(page.locator('.breadcrumb')).toContainText('Your workspace')
  await expect(page.locator('.top-avatar')).toHaveText('')
  await expect(page.getByTestId('current-output-count')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Workspace name')).toHaveValue('')
  await page.screenshot({ path: testInfo.outputPath('returning-visitor-setup.png'), fullPage: true })
  await page.getByRole('link', { name: 'Resume saved workspace', exact: true }).click()
  await expect(page).toHaveURL(/#\/overview$/)
  await expect(page.locator('.breadcrumb')).toContainText('Northstar Goods')
  const resumed = workspaceSnapshotSchema.parse(await (await page.request.get('/api/workspace')).json())
  expect(resumed.workspace.id).toBe(before.workspace.id)
  expect(resumed.artifacts).toEqual(before.artifacts)
  expect(writes).toEqual([])

  await page.getByRole('link', { name: 'New workspace', exact: true }).click()
  await page.getByLabel('Workspace name').fill('Orion project')
  await page.getByLabel('Source 1 title').fill('Launch plan')
  await page.getByLabel('Source 1 text').fill('The launch is December 8. Noor approves it.')
  await page.getByLabel('Question 1', { exact: true }).fill('When is the launch?')
  await expect(page.getByRole('button', { name: 'Create live workspace', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Start a new workspace and close this one.', exact: false }).check()
  await page.getByRole('button', { name: 'Create live workspace', exact: true }).click()
  await expect(page).toHaveURL(/#\/overview$/)
  await expect(page.locator('.breadcrumb')).toContainText('Orion project')
  await expect(page.locator('.top-avatar')).toHaveText('O')
  await expect(page.locator('.store-avatar')).toHaveText('O')
  await expect(page.getByRole('heading', { name: 'Your questions', exact: true })).toBeVisible()
  const replaced = workspaceSnapshotSchema.parse(await (await page.request.get('/api/workspace')).json())
  expect(replaced.workspace.id).not.toBe(before.workspace.id)
  expect(replaced.workspace.mode).toBe('knowledge')
  await page.screenshot({ path: testInfo.outputPath('own-workspace-identity.png'), fullPage: true })
})

// Explicitly opt in: CI's offline binding must never be presented as live inference.
for (const scenario of [
  { button: 'Project notes', example: projectExample, original: 'November 12', corrected: 'November 19', answer: /19/, affected: 3 },
  { button: 'Research notes', example: researchExample, original: '42', corrected: '51', answer: /51|fifty.one/i, affected: 2 },
]) test(`custom live answers for ${scenario.example.name} show quotes, block stale review and preserve independent work after repair`, async ({ page, baseURL }, testInfo) => {
  test.skip(process.env.UNDOGRAPH_LIVE_AI !== '1', 'Requires an explicitly enabled real Workers AI connection.')
  await page.goto('/#/overview')
  await page.getByRole('button', { name: scenario.button, exact: true }).click()
  await page.getByRole('button', { name: 'Create live workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Build agent work', exact: true }).click()
  await expect(page.getByTestId('current-output-count')).toHaveText(String(scenario.example.sources.length + scenario.example.questions.length), { timeout: 90_000 })
  const before = workspaceSnapshotSchema.parse(await (await page.request.get('/api/workspace')).json())
  const source = scenario.example.sources[0]
  const question = scenario.example.questions[0]
  const sourceArtifact = before.artifacts.find(artifact => artifact.logicalId === `source:${source.id}` && artifact.isCurrent)!
  const independent = before.artifacts.find(artifact => artifact.logicalId === `answer:${scenario.example.questions.at(-1)!.id}` && artifact.isCurrent)!
  const notes = before.artifacts.find(artifact => artifact.logicalId === `notes:${source.id}` && artifact.isCurrent)!
  const changed = before.artifacts.find(artifact => artifact.logicalId === `answer:${question.id}` && artifact.isCurrent)!
  expect(before.runs.at(-1)?.origin).toBe('live')
  expect(before.runs.at(-1)?.modelCalls).toBeGreaterThan(0)
  await page.getByRole('button', { name: source.title, exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`Source notes · ${source.title}, version 1`) }).first().click()
  await expect(page.getByRole('region', { name: 'Artifact details' })).toContainText('Exact source quotations')
  await page.getByRole('button', { name: 'Close artifact details', exact: true }).click()
  expect(notes.inputIds).toEqual([sourceArtifact.id])
  await page.getByRole('link', { name: 'Answers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pending and reviewed answers' })).toBeVisible()
  await page.locator('.reply-card').filter({ hasText: `${question.id} answer` }).click()
  await expect(page.getByRole('region', { name: 'Cited sources', exact: true })).toContainText(sourceArtifact.id)
  await page.getByRole('button', { name: 'Close artifact details', exact: true }).click()
  await page.getByRole('link', { name: 'Sources', exact: true }).click()
  await page.locator('.source-card').filter({ hasText: source.title }).getByRole('button', { name: 'Correct source text' }).click()
  await page.getByLabel('Source text', { exact: true }).fill(source.text.replace(scenario.original, scenario.corrected))
  await page.getByLabel('Reason for correction').fill('Verify a user-entered correction through the complete live UI.')
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await expect(page.getByTestId('stale-count')).toHaveText(String(scenario.affected))
  const refused = await page.request.post(`/api/artifacts/${changed.id}/release`, { data: { expectedRevision: 1 }, headers: { Origin: baseURL! } })
  expect(refused.status()).toBe(409)
  await page.getByRole('button', { name: 'Repair affected work', exact: true }).click()
  await expect(page.getByTestId('stale-count')).toHaveText('0', { timeout: 90_000 })
  const after = workspaceSnapshotSchema.parse(await (await page.request.get('/api/workspace')).json())
  expect(after.artifacts.find(artifact => artifact.logicalId === independent.logicalId && artifact.isCurrent)).toEqual(independent)
  expect(after.reports.at(-1)?.repairedLogicalIds).toHaveLength(scenario.affected)
  expect(JSON.stringify(after.artifacts.find(artifact => artifact.logicalId === changed.logicalId && artifact.isCurrent)?.body)).toMatch(scenario.answer)
  await page.getByRole('link', { name: 'Answers', exact: true }).click()
  await page.locator('.reply-card').filter({ hasText: `${question.id} answer` }).click()
  const correctedSource = after.artifacts.find(artifact => artifact.logicalId === sourceArtifact.logicalId && artifact.isCurrent)!
  await expect(page.getByRole('region', { name: 'Cited sources', exact: true })).toContainText(correctedSource.id)
  await page.screenshot({ path: testInfo.outputPath(`live-${source.id}-repaired.png`), fullPage: true })
})

test('the inspector exposes cited source version links separately from recorded inputs', async ({ page }) => {
  await page.goto('/#/recorded/replies')
  await page.locator('.reply-card').filter({ hasText: 'R-021 reply' }).click()
  const citations = page.getByRole('region', { name: 'Cited sources', exact: true })
  await expect(citations).toContainText('source_return_policy_v1')
  await expect(citations).toContainText('v1')
  await citations.getByRole('button').first().click()
  await expect(page.getByRole('region', { name: 'Artifact details', exact: true }).getByRole('heading', { name: 'Returns policy', exact: true })).toBeVisible()
})
