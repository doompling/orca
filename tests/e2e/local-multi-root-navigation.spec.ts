import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { createProject, createWorkspace } from './helpers/local-project-controls'

test.use({ seedTestRepo: false })

test('searches local Workspaces and jumps to marks through existing shortcut routing', async ({
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
  await palette.getByRole('combobox').fill('Investigate')
  await palette.getByText('Full application / Investigate login', { exact: true }).first().click()
  await expect(palette).toHaveCount(0)
  await expect(investigateRow).toHaveAttribute('aria-current', 'page')

  // Digits follow mark slots, not row order. Marking moves rows into the Marks list.
  for (const region of [full, maintenance]) {
    await region.getByRole('button', { name: 'Workspace actions for Main', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Add mark', exact: true }).click()
  }
  const marks = page.getByRole('list', { name: 'Marks', exact: true })
  const markedFull = marks.locator('[data-worktree-id]').filter({ hasText: 'Full application' })
  const markedMaintenance = marks
    .locator('[data-worktree-id]')
    .filter({ hasText: 'App A maintenance' })
  await expect(markedFull).toContainText('1')
  await expect(markedMaintenance).toContainText('2')
  await expect(mainRow).toHaveCount(0)

  // Hidden CDP cannot exercise native accelerators; send their existing renderer event.
  for (const [index, row] of [
    [0, markedFull],
    [1, markedMaintenance]
  ] as const) {
    await electronApp.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('ui:jumpToWorktreeIndex', target)
    }, index)
    await expect(row).toHaveAttribute('aria-current', 'page')
  }
  // An empty slot is a no-op rather than shifting to the next Workspace.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('ui:jumpToWorktreeIndex', 4)
  })
  await expect(markedMaintenance).toHaveAttribute('aria-current', 'page')
  await expect(maintenanceRow).toHaveCount(0)
  await full.getByRole('button', { name: 'Full application', exact: true }).click()
  await expect(markedFull).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: testInfo.outputPath('local-workspace-navigation.png') })
})
