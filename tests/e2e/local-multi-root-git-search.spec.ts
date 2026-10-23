import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { cleanupTestRepository } from './global-teardown'
import { createGoldenWorktree } from './helpers/golden-source-control'
import { appendToReadme, createProject, openRootReadme } from './helpers/local-project-controls'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test.use({ seedTestRepo: false })

function git(directory: string, args: string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
}

test('searches both roots and targets Git and an existing worktree through normal controls', async ({
  electronApp,
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const appA = createSeededTestRepo({ publishPath: false })
  registerPostElectronShutdownCleanup(async () => cleanupTestRepository(appA))
  const appB = createSeededTestRepo({ publishPath: false })
  registerPostElectronShutdownCleanup(async () => cleanupTestRepository(appB))
  const alternate = createGoldenWorktree(appA, 'multi-root')
  const labelA = path.basename(appA)
  const labelB = path.basename(appB)
  writeFileSync(path.join(appA, 'README.md'), '# App A\n\ntworootneedle from A\n')
  writeFileSync(path.join(appB, 'README.md'), '# App B\n\ntworootneedle from B\n')
  const beforeA = git(appA, ['worktree', 'list', '--porcelain'])
  const beforeB = git(appB, ['worktree', 'list', '--porcelain'])
  const initialHeadB = git(appB, ['rev-parse', 'HEAD'])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await createProject(page, 'Full application', [appA, appB])
  expect(git(appA, ['worktree', 'list', '--porcelain'])).toBe(beforeA)
  expect(git(appB, ['worktree', 'list', '--porcelain'])).toBe(beforeB)
  // Hidden CDP keystrokes bypass Electron's native accelerator; reuse its renderer event.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('ui:openQuickOpen')
  })
  const quickOpen = page.getByRole('dialog', { name: 'Go to file', exact: true })
  await quickOpen.getByPlaceholder('Search files in all directories…').fill('README.md')
  await expect(
    quickOpen.getByRole('option', { name: `${labelA} / README.md`, exact: true })
  ).toBeVisible()
  await quickOpen.getByRole('option', { name: `${labelB} / README.md`, exact: true }).click()
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText('tworootneedle from B')
  await expect(page.locator('.editor-header-path:visible').first()).toContainText(labelB)

  await page.getByRole('radio', { name: 'Search file contents', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search files', exact: true })
  await search.fill('tworootneedle')
  await search.press('Enter')
  await expect(
    page.getByRole('button', { name: new RegExp(`README\\.md.*${labelA}`) })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: new RegExp(`README\\.md.*${labelB}`) })
  ).toBeVisible()
  await page.getByRole('button').filter({ hasText: 'tworootneedle from A' }).click()
  await expect(page.locator('.editor-header-path:visible').first()).toContainText(labelA)
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText('tworootneedle from A')
  await page.screenshot({ path: testInfo.outputPath('all-root-search.png') })

  await page.getByRole('button', { name: /Source Control/ }).click()
  await expect(page.getByLabel('Git directory')).toContainText(labelA)
  const unstaged = page.locator(
    '[data-source-control-path="README.md"][data-source-control-area="unstaged"]'
  )
  const staged = page.locator(
    '[data-source-control-path="README.md"][data-source-control-area="staged"]'
  )
  await expect(unstaged).toBeVisible()
  await unstaged.getByRole('button', { name: 'Stage README.md', exact: true }).click()
  await expect(staged).toBeVisible()
  expect(git(appA, ['diff', '--cached', '--name-only'])).toBe('README.md')
  expect(git(appB, ['diff', '--cached', '--name-only'])).toBe('')
  await staged.getByRole('button', { name: 'Unstage README.md', exact: true }).click()
  await expect(unstaged).toBeVisible()
  expect(git(appA, ['diff', '--cached', '--name-only'])).toBe('')
  await unstaged.getByRole('button', { name: 'Stage README.md', exact: true }).click()
  await expect(staged).toBeVisible()
  await page.getByRole('textbox', { name: 'Commit message', exact: true }).fill('test: app A only')
  await page.getByRole('button', { name: 'Commit staged changes', exact: true }).click()
  await expect.poll(() => git(appA, ['log', '-1', '--format=%s'])).toBe('test: app A only')
  expect(git(appB, ['rev-parse', 'HEAD'])).toBe(initialHeadB)
  expect(git(appB, ['status', '--porcelain'])).toBe('M README.md')
  await page.getByLabel('Git directory').click()
  await page.getByRole('option', { name: labelB, exact: true }).click()
  await expect(unstaged).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('root-specific-git.png') })

  const beforeOverrideA = git(appA, ['worktree', 'list', '--porcelain'])
  await page.getByRole('button', { name: 'New Workspace in Full application', exact: true }).click()
  const workspace = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await workspace.getByLabel('Workspace name').fill('Isolated App A')
  await workspace.getByRole('button', { name: 'Choose worktrees', exact: true }).click()
  await workspace.getByLabel(`${labelA} existing worktree path`).fill(alternate.worktreePath)
  await workspace.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(workspace).toHaveCount(0)
  expect(git(appA, ['worktree', 'list', '--porcelain'])).toBe(beforeOverrideA)
  expect(git(appB, ['worktree', 'list', '--porcelain'])).toBe(beforeB)
  await expect(page.getByLabel('Git directory')).toContainText(labelA)
  await expect(page.getByText(alternate.branchName, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Explorer/ }).click()
  await page.getByRole('radio', { name: 'Filter files by name', exact: true }).click()
  await openRootReadme(page, labelA)
  await expect(page.locator('.rich-markdown-editor:visible')).not.toContainText(
    'tworootneedle from A'
  )
  await appendToReadme(page, 'Isolated checkout edit')
  await page.keyboard.press('ControlOrMeta+S')
  await expect
    .poll(() => readFileSync(path.join(alternate.worktreePath, 'README.md'), 'utf8'))
    .toContain('Isolated checkout edit')
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).not.toContain('Isolated checkout edit')

  await test.step('stages and commits only the selected alternate App A checkout', async () => {
    const originalHead = git(appA, ['rev-parse', 'HEAD'])
    const originalIndex = git(appA, ['ls-files', '--stage'])
    const sharedHead = git(appB, ['rev-parse', 'HEAD'])
    const sharedIndex = git(appB, ['ls-files', '--stage'])
    const alternateHead = git(alternate.worktreePath, ['rev-parse', 'HEAD'])
    await page.getByRole('button', { name: /Source Control/ }).click()
    await page.getByLabel('Git directory').click()
    await page.getByRole('option', { name: labelA, exact: true }).click()
    await expect(
      page.getByLabel('Workspace Source Control').getByText(alternate.branchName, { exact: true })
    ).toBeVisible()
    await expect(unstaged).toBeVisible()
    await unstaged.getByRole('button', { name: 'Stage README.md', exact: true }).click()
    await expect(staged).toBeVisible()
    expect(git(alternate.worktreePath, ['diff', '--cached', '--name-only'])).toBe('README.md')
    expect(git(appA, ['ls-files', '--stage'])).toBe(originalIndex)
    expect(git(appB, ['ls-files', '--stage'])).toBe(sharedIndex)
    await page
      .getByRole('textbox', { name: 'Commit message', exact: true })
      .fill('test: alternate App A only')
    await page.getByRole('button', { name: 'Commit staged changes', exact: true }).click()
    await expect
      .poll(() => git(alternate.worktreePath, ['log', '-1', '--format=%s']))
      .toBe('test: alternate App A only')
    expect(git(alternate.worktreePath, ['rev-parse', 'HEAD'])).not.toBe(alternateHead)
    expect(git(alternate.worktreePath, ['diff', '--cached', '--name-only'])).toBe('')
    expect(git(appA, ['rev-parse', 'HEAD'])).toBe(originalHead)
    expect(git(appA, ['ls-files', '--stage'])).toBe(originalIndex)
    expect(git(appB, ['rev-parse', 'HEAD'])).toBe(sharedHead)
    expect(git(appB, ['ls-files', '--stage'])).toBe(sharedIndex)
    await page.screenshot({ path: testInfo.outputPath('alternate-checkout-commit.png') })
    await page.getByRole('button', { name: /Explorer/ }).click()
  })

  await page.getByRole('button', { name: 'Terminal in this directory', exact: true }).click()
  await waitForActiveTerminalManager(page)
  await waitForActivePanePtyId(page)
  await focusActiveTerminalInput(page)
  await page.keyboard.type('pwd')
  await page.keyboard.press('Enter')
  await expect.poll(() => getTerminalContent(page)).toContain(alternate.worktreePath)
  await openRootReadme(page, labelB)
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText('tworootneedle from B')
  await appendToReadme(page, 'Shared App B from isolated workspace')
  await page.keyboard.press('ControlOrMeta+S')
  await expect
    .poll(() => readFileSync(path.join(appB, 'README.md'), 'utf8'))
    .toContain('Shared App B from isolated workspace')
  await page.screenshot({ path: testInfo.outputPath('one-isolated-root.png') })

  await test.step('shared checkout branch follows Git, not the selected Workspace', async () => {
    const full = page.getByRole('region', { name: 'Full application', exact: true })
    const main = full.locator('[data-worktree-id]').filter({ hasText: /^Main/ })
    const isolated = full.locator('[data-worktree-id]').filter({ hasText: /^Isolated App A/ })
    const sourceControl = page.getByLabel('Workspace Source Control', { exact: true })
    const originalBranch = git(appB, ['symbolic-ref', '--short', 'HEAD'])
    const changedBranch = 'e2e-shared-workspace-branch'
    const sharedText = readFileSync(path.join(appB, 'README.md'), 'utf8')
    const appABranch = git(appA, ['symbolic-ref', '--short', 'HEAD'])
    const showSharedCheckout = async (row: Locator, branch: string) => {
      await row.click()
      await expect(row).toHaveAttribute('aria-current', 'page')
      await page.getByRole('button', { name: /Source Control/ }).click()
      await page.getByLabel('Git directory').click()
      await page.getByRole('option', { name: labelB, exact: true }).click()
      await expect(sourceControl.getByText(branch, { exact: true })).toBeVisible()
      expect(git(appB, ['symbolic-ref', '--short', 'HEAD'])).toBe(branch)
      expect(git(appB, ['rev-parse', 'HEAD'])).toBe(initialHeadB)
      expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe(sharedText)
    }
    await showSharedCheckout(main, originalBranch)
    await showSharedCheckout(isolated, originalBranch)

    // Only the disposable fixture command switches Git; Workspace navigation must not.
    git(appB, ['checkout', '-b', changedBranch])
    await expect(sourceControl.getByText(changedBranch, { exact: true })).toBeVisible({
      timeout: 15_000
    })
    for (const row of [main, isolated, main]) {
      await showSharedCheckout(row, changedBranch)
    }
    expect(git(appA, ['symbolic-ref', '--short', 'HEAD'])).toBe(appABranch)
    expect(git(alternate.worktreePath, ['symbolic-ref', '--short', 'HEAD'])).toBe(
      alternate.branchName
    )
    await page.screenshot({ path: testInfo.outputPath('shared-checkout-branch.png') })

    git(appB, ['checkout', originalBranch])
    await expect(sourceControl.getByText(originalBranch, { exact: true })).toBeVisible({
      timeout: 15_000
    })
    await showSharedCheckout(isolated, originalBranch)
    await showSharedCheckout(main, originalBranch)
  })
  expect(errors).toEqual([])
})
