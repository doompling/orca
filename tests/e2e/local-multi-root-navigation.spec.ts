import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { createProject, createWorkspace } from './helpers/local-project-controls'

test.use({ seedTestRepo: false })

test('searches local Workspaces and follows sidebar order through existing shortcut routing', async ({
  orcaPage: page,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-navigation-'))
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  mkdirSync(appA)
  mkdirSync(appB)
  await createProject(page, 'Full application', [appA, appB])
  await createWorkspace(page, 'Full application', 'Investigate login')
  await createProject(page, 'App A maintenance', [appA])
  const full = page.getByRole('region', { name: 'Full application', exact: true })
  const maintenance = page.getByRole('region', { name: 'App A maintenance', exact: true })
  const mainRow = full.locator('[data-worktree-id]').filter({ hasText: /^Main/ })
  const investigateRow = full
    .locator('[data-worktree-id]')
    .filter({ hasText: /^Investigate login/ })
  const maintenanceRow = maintenance.locator('[data-worktree-id]')

  await page.getByRole('button', { name: 'Search worktrees and browser tabs', exact: true }).click()
  const palette = page.getByRole('dialog', { name: 'Jump to...', exact: true })
  await palette
    .getByPlaceholder('Search chats, terminals, worktrees, settings, and actions...')
    .fill('Investigate')
  await palette.getByText('Full application / Investigate login', { exact: true }).first().click()
  await expect(palette).toHaveCount(0)
  await expect(investigateRow).toHaveAttribute('aria-current', 'page')

  // Hidden CDP cannot exercise native accelerators; send their existing renderer event.
  for (const index of [0, 2]) {
    await electronApp.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('ui:jumpToWorktreeIndex', target)
    }, index)
    await expect(index === 0 ? mainRow : maintenanceRow).toHaveAttribute('aria-current', 'page')
  }
  await full.getByRole('button', { name: 'Full application', exact: true }).click()
  await expect(mainRow).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: testInfo.outputPath('local-workspace-navigation.png') })
})
