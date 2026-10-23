import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import {
  appendToReadme,
  createProject,
  createWorkspace,
  openRootReadme
} from './helpers/local-project-controls'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test.use({ seedTestRepo: false })

test('creates overlapping multi-root Projects that share one draft per file through normal controls', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-project-journey-'))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  for (const directory of [appA, appB]) {
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'README.md'), `# ${path.basename(directory)} marker\n`)
  }
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  const rendererErrors: string[] = []
  page.on('pageerror', (error) => rendererErrors.push(error.message))

  await createProject(page, 'Full application', [appA, appB])
  const fullApplication = page.getByRole('region', { name: 'Full application', exact: true })
  const main = fullApplication.locator('[data-worktree-id]').filter({ hasText: /^Main/ })
  await expect(main).toHaveAttribute('aria-current', 'page')
  const roots = page.getByRole('group', { name: 'Browse directory' })
  await expect(roots.getByRole('button')).toHaveCount(2)
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe('# app_a marker\n')
  expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b marker\n')

  for (const [label, directory] of [
    ['app_a', appA],
    ['app_b', appB]
  ]) {
    const savedText = `Saved through UI in ${label.replaceAll('_', ' ')}`
    await openRootReadme(page, label)
    await expect(page.locator('.rich-markdown-editor:visible')).toContainText(`${label} marker`)
    await appendToReadme(page, savedText)
    await page.keyboard.press('ControlOrMeta+S')
    await expect
      .poll(() => readFileSync(path.join(directory, 'README.md'), 'utf8'))
      .toContain(savedText)
  }
  await page.screenshot({ path: testInfo.outputPath('two-root-file-editing.png') })

  const terminalIds: string[] = []
  for (const [label, directory] of [
    ['app_a', appA],
    ['app_b', appB]
  ]) {
    await roots.getByRole('button', { name: label, exact: true }).click()
    await page.getByRole('button', { name: 'Terminal in this directory', exact: true }).click()
    await waitForActiveTerminalManager(page)
    terminalIds.push(await waitForActivePanePtyId(page))
    await focusActiveTerminalInput(page)
    await page.keyboard.type('pwd')
    await page.keyboard.press('Enter')
    await expect.poll(() => getTerminalContent(page)).toContain(realpathSync(directory))
  }
  expect(terminalIds[0]).not.toBe(terminalIds[1])

  // One physical file has one editor buffer: every Workspace that opens it shares its draft.
  const editor = page.locator('.rich-markdown-editor:visible')
  await openRootReadme(page, 'app_a')
  await appendToReadme(page, 'Main shared draft')
  await createWorkspace(page, 'Full application', 'Investigate login')
  const investigate = fullApplication
    .locator('[data-worktree-id]')
    .filter({ hasText: /^Investigate login/ })
  await expect(investigate).toHaveAttribute('aria-current', 'page')
  await expect(editor).toHaveCount(0)
  await openRootReadme(page, 'app_a')
  await expect(editor).toContainText('Main shared draft')
  await appendToReadme(page, 'Investigate shared draft')
  await main.click()
  await expect(editor).toContainText('Main shared draft')
  await expect(editor).toContainText('Investigate shared draft')

  await createProject(page, 'App A maintenance', [appA])
  await expect(roots.getByRole('button')).toHaveCount(1)
  await openRootReadme(page, 'app_a')
  await expect(editor).toContainText('Investigate shared draft')
  await appendToReadme(page, 'Maintenance shared draft')
  await investigate.click()
  await expect(editor).toContainText('Maintenance shared draft')
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).not.toContain('shared draft')
  await page.screenshot({ path: testInfo.outputPath('overlapping-project-drafts.png') })

  await main.click()
  await page.keyboard.press('ControlOrMeta+S')
  await expect
    .poll(() => readFileSync(path.join(appA, 'README.md'), 'utf8'))
    .toContain('Maintenance shared draft')
  await investigate.click()
  await expect(editor).toContainText('Maintenance shared draft')
  await expect(
    page.getByRole('alert').filter({ hasText: 'This file changed on disk.' })
  ).toHaveCount(0)
  await main.click()
  await appendToReadme(page, 'Second Main saved update')
  await page.keyboard.press('ControlOrMeta+S')
  await expect
    .poll(() => readFileSync(path.join(appA, 'README.md'), 'utf8'))
    .toContain('Second Main saved update')
  await investigate.click()
  await expect(editor).toContainText('Second Main saved update')

  await main.click()
  await appendToReadme(page, 'Draft retained while archived')
  await investigate.click()
  const diskBeforeArchive = readFileSync(path.join(appA, 'README.md'), 'utf8')
  await fullApplication.getByRole('button', { name: 'Workspace actions for Main' }).click()
  await page.getByRole('menuitem', { name: 'Rename Workspace', exact: true }).click()
  const rename = page.getByRole('dialog', { name: 'Rename Workspace', exact: true })
  await rename.getByLabel('Workspace name').fill('Daily work')
  await rename.getByRole('button', { name: 'Save name', exact: true }).click()
  await expect(rename).toHaveCount(0)
  const daily = fullApplication.locator('[data-worktree-id]').filter({ hasText: /^Daily work/ })
  await expect(daily).toBeVisible()
  await fullApplication.getByRole('button', { name: 'Workspace actions for Daily work' }).click()
  await page.getByRole('menuitem', { name: 'Archive Workspace', exact: true }).click()
  await expect(daily).toHaveCount(0)
  await page.getByRole('button', { name: 'Show archived', exact: true }).click()
  await expect(daily).toBeDisabled()
  await fullApplication.getByRole('button', { name: 'Workspace actions for Daily work' }).click()
  await page.getByRole('menuitem', { name: 'Restore Workspace', exact: true }).click()
  await expect(daily).toBeEnabled()
  await daily.click()
  await expect(editor).toContainText('Draft retained while archived')
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe(diskBeforeArchive)
  await page.screenshot({ path: testInfo.outputPath('restored-archived-workspace.png') })
  expect(rendererErrors).toEqual([])
})
