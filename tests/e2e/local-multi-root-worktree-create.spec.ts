import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { runProcess } from '@orca/process-host'
import { test, expect } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { cleanupTestRepository } from './global-teardown'
import { appendToReadme, createProject, openRootReadme } from './helpers/local-project-controls'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test.use({ seedTestRepo: false })

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await runProcess({ program: 'git', args, cwd, timeoutMs: 15_000 })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`Fixture Git failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}

async function workspaceForm(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: 'New Workspace in Create checkouts', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await dialog.getByLabel('Workspace name').fill(name)
  await dialog.getByRole('button', { name: 'Choose worktrees', exact: true }).click()
  return dialog
}

async function createForRoot(
  dialog: Locator,
  label: string,
  branch: string,
  target: string
): Promise<void> {
  await dialog
    .getByRole('button', { name: `Create new worktree for ${label}`, exact: true })
    .click()
  await dialog.getByLabel(`${label} new branch`, { exact: true }).fill(branch)
  await dialog.getByLabel(`${label} new worktree directory`, { exact: true }).fill(target)
  await dialog.getByRole('button', { name: 'Create worktree', exact: true }).click()
}

test('creates a new per-root worktree without changing shared roots and retains cancelled checkouts', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const appA = createSeededTestRepo({ publishPath: false })
  const appB = createSeededTestRepo({ publishPath: false })
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'orca-local-create-')))
  const notes = path.join(scratch, 'notes')
  mkdirSync(notes)
  writeFileSync(path.join(notes, 'keep.txt'), 'Keep these shared notes.\n')
  registerPostElectronShutdownCleanup(async () => {
    cleanupTestRepository(appA)
    cleanupTestRepository(appB)
    rmSync(scratch, { recursive: true, force: true })
  })
  const labelA = path.basename(appA)
  const labelB = path.basename(appB)
  const beforeA = {
    head: await git(appA, ['rev-parse', 'HEAD']),
    branch: await git(appA, ['symbolic-ref', '--short', 'HEAD']),
    index: await git(appA, ['ls-files', '--stage'])
  }
  const beforeB = {
    head: await git(appB, ['rev-parse', 'HEAD']),
    branch: await git(appB, ['symbolic-ref', '--short', 'HEAD']),
    index: await git(appB, ['ls-files', '--stage']),
    worktrees: await git(appB, ['worktree', 'list', '--porcelain'])
  }
  await createProject(page, 'Create checkouts', [appA, appB, notes])
  const dialog = await workspaceForm(page, 'New App A checkout')
  const folderTarget = path.join(scratch, 'not-a-git-worktree')
  await createForRoot(dialog, 'notes', 'notes-feature', folderTarget)
  await expect(dialog.getByRole('alert')).toContainText('Plain folders remain shared')
  expect(existsSync(folderTarget)).toBe(false)
  await dialog.getByRole('button', { name: 'Create new worktree for notes', exact: true }).click()

  await createForRoot(dialog, labelA, 'ui-created-a', appB)
  await expect(dialog.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible()
  expect(await git(appB, ['rev-parse', 'HEAD'])).toBe(beforeB.head)
  expect(await git(appB, ['ls-files', '--stage'])).toBe(beforeB.index)
  const created = path.join(scratch, 'created-app-a')
  await dialog.getByLabel(`${labelA} new worktree directory`).fill(created)
  await dialog.getByRole('button', { name: 'Create worktree', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText(
    `Created branch ui-created-a at ${created}`
  )
  await expect(dialog.getByText(/Project checkout's current committed HEAD/)).toContainText(appA)
  await expect(dialog.getByLabel(`${labelA} existing worktree path`)).toHaveValue(created)
  await expect(dialog.getByLabel(`${labelB} existing worktree path`)).toHaveValue('')
  await expect(dialog.getByLabel('notes existing worktree path')).toHaveValue('')
  await dialog.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const roots = page.getByRole('group', { name: 'Browse directory' })
  await expect(roots.getByRole('button', { name: labelA, exact: true })).toHaveAttribute(
    'title',
    created
  )
  await expect(roots.getByRole('button', { name: labelB, exact: true })).toHaveAttribute(
    'title',
    appB
  )
  await expect(roots.getByRole('button', { name: 'notes', exact: true })).toHaveAttribute(
    'title',
    notes
  )
  await page.getByRole('button', { name: /Source Control/ }).click()
  await expect(page.getByLabel('Git directory')).toContainText(labelA)
  await expect(page.getByText('ui-created-a', { exact: true })).toBeVisible()
  expect(await git(created, ['rev-parse', 'HEAD'])).toBe(beforeA.head)
  expect(await git(appA, ['symbolic-ref', '--short', 'HEAD'])).toBe(beforeA.branch)
  expect(await git(appA, ['ls-files', '--stage'])).toBe(beforeA.index)
  expect(await git(appB, ['worktree', 'list', '--porcelain'])).toBe(beforeB.worktrees)
  expect(await git(appB, ['symbolic-ref', '--short', 'HEAD'])).toBe(beforeB.branch)
  await page.screenshot({ path: testInfo.outputPath('created-root-worktree.png') })

  await test.step('file saves and terminal writes target only the newly created checkout', async () => {
    const originalReadme = readFileSync(path.join(appA, 'README.md'), 'utf8')
    const sharedReadme = readFileSync(path.join(appB, 'README.md'), 'utf8')
    const marker = `new-checkout-${randomUUID()}`
    const markerFile = `${marker}.txt`
    await page.getByRole('button', { name: /Explorer/ }).click()
    await openRootReadme(page, labelA)
    await appendToReadme(page, marker)
    await page.keyboard.press('ControlOrMeta+S')
    await expect.poll(() => readFileSync(path.join(created, 'README.md'), 'utf8')).toContain(marker)
    expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe(originalReadme)
    expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe(sharedReadme)

    await page.getByRole('button', { name: 'Terminal in this directory', exact: true }).click()
    await waitForActiveTerminalManager(page)
    await waitForActivePanePtyId(page)
    await focusActiveTerminalInput(page)
    const expectedPath = Buffer.from(created).toString('base64')
    // Refuse the write outside this fixture even if terminal cwd selection regresses.
    await page.keyboard.type(
      `node -e "const fs=require('fs');const expected=Buffer.from('${expectedPath}','base64').toString();if(fs.realpathSync(process.cwd())===fs.realpathSync(expected)){fs.writeFileSync('${markerFile}','${marker}');console.log(process.cwd());console.log('${marker}')}else{throw Error('Unexpected checkout cwd')}"`
    )
    await page.keyboard.press('Enter')
    await expect.poll(() => existsSync(path.join(created, markerFile))).toBe(true)
    expect(readFileSync(path.join(created, markerFile), 'utf8')).toBe(marker)
    for (const otherRoot of [appA, appB, notes]) {
      expect(existsSync(path.join(otherRoot, markerFile))).toBe(false)
    }
    await expect.poll(() => getTerminalContent(page)).toContain(created)
    await page.screenshot({
      path: testInfo.outputPath('created-checkout-file-terminal-target.png')
    })
    await page.getByRole('button', { name: /Source Control/ }).click()
    await expect(page.getByText('ui-created-a', { exact: true })).toBeVisible()
  })

  const cancelled = await workspaceForm(page, 'Cancelled checkout view')
  const retained = path.join(scratch, 'retained-app-a')
  await createForRoot(cancelled, labelA, 'ui-retained-a', retained)
  await expect(cancelled.getByRole('status')).toContainText(
    'Cancelling or a failed save leaves this worktree intact'
  )
  await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(cancelled).toHaveCount(0)
  await expect(page.getByText('Cancelled checkout view', { exact: true })).toHaveCount(0)
  expect(await git(retained, ['symbolic-ref', '--short', 'HEAD'])).toBe('ui-retained-a')
  const recovered = await workspaceForm(page, 'Recovered checkout')
  await recovered.getByLabel(`${labelA} existing worktree path`).fill(retained)
  await recovered.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(recovered).toHaveCount(0)
  await expect(page.getByText('ui-retained-a', { exact: true })).toBeVisible()
  expect(await git(appB, ['rev-parse', 'HEAD'])).toBe(beforeB.head)
  expect(await git(appB, ['ls-files', '--stage'])).toBe(beforeB.index)
})
