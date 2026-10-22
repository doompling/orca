import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { createProject, createWorkspace } from './helpers/local-project-controls'

test.use({ seedTestRepo: false })

const PROJECT = 'Sidebar switching'
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

function row(page: Page, name: string) {
  return page.locator('[data-worktree-id]').filter({ has: page.getByText(name, { exact: true }) })
}

async function openRowMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `Workspace actions for ${name}`, exact: true }).click()
}

test('marks, switches, and archives local Workspaces from the redesigned sidebar', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'ether-sidebar-switching-'))
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  mkdirSync(appA)
  mkdirSync(appB)
  await createProject(page, PROJECT, [appA, appB])
  await createWorkspace(page, PROJECT, 'Review queue')
  await createWorkspace(page, PROJECT, 'Spike')
  await expect(row(page, 'Spike')).toHaveAttribute('aria-current', 'page')

  // Linear moved off every row; roots live once, in the footer.
  await expect(page.getByText('Link Linear issue')).toHaveCount(0)
  const footer = page.getByLabel('Open Workspace directories', { exact: true })
  await expect(footer).toContainText('Spike')
  await expect(footer).toContainText('app_a')
  await expect(footer).toContainText('app_b')

  // Ctrl+` returns to the previously visited Workspace.
  await row(page, 'Review queue').click()
  await expect(row(page, 'Review queue')).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Control+Backquote')
  await expect(row(page, 'Spike')).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Control+Backquote')
  await expect(row(page, 'Review queue')).toHaveAttribute('aria-current', 'page')

  // Marks: one from the keyboard, one from the menu; both leave their Project for Marks.
  await page.keyboard.press(`${mod}+Shift+KeyH`)
  await openRowMenu(page, 'Main')
  await page.getByRole('menuitem', { name: 'Add mark', exact: true }).click()
  const marks = page.getByRole('list', { name: 'Marks', exact: true })
  await expect(marks.locator('[data-worktree-id]')).toHaveCount(2)
  await expect(marks.locator('[data-worktree-id]').first()).toContainText('Review queue')
  await expect(
    page.getByRole('region', { name: PROJECT, exact: true }).locator('[data-worktree-id]')
  ).toHaveCount(1)

  await page.keyboard.press(`${mod}+Semicolon`)
  const marksDialog = page.getByRole('dialog', { name: 'Workspace marks', exact: true })
  await expect(marksDialog).toBeVisible()
  await page.keyboard.press('Digit2')
  await expect(marksDialog).toHaveCount(0)
  await expect(row(page, 'Main')).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: testInfo.outputPath('sidebar-marks-light.png') })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('sidebar-marks-dark.png') })

  // Archive the open Workspace: the previous one opens and Undo restores it with its mark.
  await openRowMenu(page, 'Main')
  await page.getByRole('menuitem', { name: /^Archive Workspace/ }).click()
  await expect(row(page, 'Main')).toHaveCount(0)
  await expect(row(page, 'Review queue')).toHaveAttribute('aria-current', 'page')
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Archived Main' })
  await expect(toast).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('sidebar-archive-undo-dark.png') })
  await toast.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(row(page, 'Main')).toHaveAttribute('aria-current', 'page')
  await expect(marks.locator('[data-worktree-id]')).toHaveCount(2)
  await page.emulateMedia({ colorScheme: 'light' })
})
