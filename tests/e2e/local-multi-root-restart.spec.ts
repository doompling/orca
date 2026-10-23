import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { createRestartSession } from './helpers/orca-restart'
import { startBrowserLinkServer } from './helpers/browser-link-server'
import {
  appendToReadme,
  createProject,
  createWorkspace,
  openRootReadme
} from './helpers/local-project-controls'
import { waitForSessionReady } from './helpers/store'
import {
  focusLastTerminalPane,
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForPaneIdentitySnapshot
} from './helpers/terminal'

const VISIBLE_TABS = '[data-tab-id][data-active]:visible'

function workspaceRow(page: Page, project: string, workspace: string) {
  return page
    .getByRole('region', { name: project, exact: true })
    .locator('[data-worktree-id]')
    .filter({
      has: page.getByText(workspace, { exact: true })
    })
}

function visibleTabIds(page: Page): Promise<(string | null)[]> {
  return page
    .locator(VISIBLE_TABS)
    .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-id')))
}

test('restores overlapping Projects, their shared drafts and the same live terminal after normal quit', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both Electron launches.
{}, testInfo) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-project-restart-'))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  for (const directory of [appA, appB]) {
    mkdirSync(directory)
    writeFileSync(
      path.join(directory, 'README.md'),
      `# ${path.basename(directory)} restart marker\n`
    )
  }
  const session = createRestartSession(testInfo)
  const browserServer = await startBrowserLinkServer()
  let runningApp: ElectronApplication | null = null
  const rendererErrors: string[] = []
  const closeDiagnostics: string[] = []
  try {
    const first = await session.launch({ onStderr: (chunk) => closeDiagnostics.push(chunk) })
    runningApp = first.app
    first.page.on('pageerror', (error) => rendererErrors.push(error.message))
    first.page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        closeDiagnostics.push(`[renderer ${message.type()}] ${message.text()}`)
      }
    })
    await waitForSessionReady(first.page)
    await createProject(first.page, 'Full application', [appA, appB])
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Main A restart draft')
    await openRootReadme(first.page, 'app_b')
    await appendToReadme(first.page, 'Main B restart draft')

    await first.page
      .getByRole('button', { name: 'Terminal in this directory', exact: true })
      .click()
    await waitForActiveTerminalManager(first.page)
    await waitForActivePanePtyId(first.page)
    await first.page.getByRole('button', { name: 'Split Terminal Right', exact: true }).click()
    const mainPanes = await waitForPaneIdentitySnapshot(first.page, 2)
    const ptyId = await waitForActivePanePtyId(first.page)
    const terminalTabId = await first.page
      .locator(`${VISIBLE_TABS}[data-active="true"]`)
      .getAttribute('data-tab-id')
    expect(terminalTabId).toBeTruthy()
    await focusActiveTerminalInput(first.page)
    await first.page.keyboard.type('echo TERMINAL_BEFORE_LOCAL_PROJECT_QUIT')
    await first.page.keyboard.press('Enter')
    await expect
      .poll(() => getTerminalContent(first.page))
      .toContain('TERMINAL_BEFORE_LOCAL_PROJECT_QUIT')
    await first.page.getByRole('button', { name: 'New tab', exact: true }).click()
    await first.page.getByRole('menuitem', { name: /New Browser Tab/i }).click()
    const addressBar = first.page.locator('[data-orca-browser-address-bar="true"]:visible')
    await addressBar.fill(browserServer.sourceUrl)
    await addressBar.press('Enter')
    await expect(first.page.locator(VISIBLE_TABS).filter({ hasText: 'Source page' })).toBeVisible()
    await first.page.locator(`${VISIBLE_TABS}[data-tab-id="${terminalTabId}"]`).click()
    const mainTabs = await visibleTabIds(first.page)
    await first.page.screenshot({ path: testInfo.outputPath('main-before-quit.png') })

    await createWorkspace(first.page, 'Full application', 'Investigate login')
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Investigate restart draft')
    const investigateTabs = await visibleTabIds(first.page)
    await createProject(first.page, 'App A maintenance', [appA])
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Maintenance restart draft')
    const maintenanceTabs = await visibleTabIds(first.page)
    await testInfo.attach('selection-before-quit.json', {
      body: JSON.stringify(
        await first.page.evaluate(() => {
          const state = window.__store?.getState()
          return {
            activeWorktreeId: state?.activeWorktreeId,
            activeWorkspaceKey: state?.activeWorkspaceKey,
            activeWorkspaceExecutionHostId: state?.activeWorkspaceExecutionHostId
          }
        })
      ),
      contentType: 'application/json'
    })
    const firstProcess = first.app.process()
    const closing = session.close(first.app)
    const closedQuickly = await Promise.race([
      closing.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500))
    ])
    if (!closedQuickly && !first.page.isClosed()) {
      await first.page.screenshot({ path: testInfo.outputPath('quit-pending.png') })
      closeDiagnostics.push(await first.page.locator('body').innerText())
      closeDiagnostics.push(
        JSON.stringify(
          await first.page.evaluate(() => {
            const state = window.__store?.getState()
            return {
              workspaceSessionReady: state?.workspaceSessionReady,
              hydrationSucceeded: state?.hydrationSucceeded,
              activeWorkspaceKey: state?.activeWorkspaceKey,
              dirtyFiles: state?.openFiles
                .filter((file) => file.isDirty)
                .map((file) => ({
                  id: file.id,
                  mode: file.mode,
                  worktreeId: file.worktreeId,
                  hasDraft: state.editorDrafts[file.id] !== undefined,
                  readOnly: file.readOnly,
                  runtimeEnvironmentId: file.runtimeEnvironmentId
                }))
            }
          })
        )
      )
    }
    await closing
    runningApp = null
    expect(
      firstProcess.signalCode,
      'Normal quit must not require the helper to kill Electron'
    ).toBeNull()
    expect(firstProcess.exitCode).toBe(0)

    const second = await session.launch()
    runningApp = second.app
    second.page.on('pageerror', (error) => rendererErrors.push(error.message))
    await waitForSessionReady(second.page)
    await testInfo.attach('selection-after-relaunch.json', {
      body: JSON.stringify(
        await second.page.evaluate(() => {
          const state = window.__store?.getState()
          return {
            activeWorktreeId: state?.activeWorktreeId,
            activeWorkspaceKey: state?.activeWorkspaceKey,
            activeWorkspaceExecutionHostId: state?.activeWorkspaceExecutionHostId
          }
        })
      ),
      contentType: 'application/json'
    })
    await expect(workspaceRow(second.page, 'App A maintenance', 'Main')).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Maintenance restart draft'
    )
    expect(await visibleTabIds(second.page)).toEqual(maintenanceTabs)

    await second.page
      .getByRole('region', { name: 'Full application', exact: true })
      .getByRole('button', { name: 'Full application', exact: true })
      .click()
    await expect(
      workspaceRow(second.page, 'Full application', 'Investigate login')
    ).toHaveAttribute('aria-current', 'page')
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Investigate restart draft'
    )
    // Both Workspaces opened the same file, so they share its one restored draft.
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Maintenance restart draft'
    )
    expect(await visibleTabIds(second.page)).toEqual(investigateTabs)
    await workspaceRow(second.page, 'Full application', 'Main').click()
    await expect.poll(() => visibleTabIds(second.page)).toEqual(mainTabs)
    const terminalTab = second.page.locator(`${VISIBLE_TABS}[data-tab-id="${terminalTabId}"]`)
    await expect(terminalTab).toBeVisible()
    await terminalTab.click()
    await waitForActiveTerminalManager(second.page)
    const restoredPanes = await waitForPaneIdentitySnapshot(second.page, 2)
    expect(restoredPanes.ptyIdsByLeafId).toEqual(mainPanes.ptyIdsByLeafId)
    // The marker was typed in the split's new (last) pane; focus it rather than rely on restored focus.
    await focusLastTerminalPane(second.page)
    expect(await waitForActivePanePtyId(second.page)).toBe(ptyId)
    await expect
      .poll(() => getTerminalContent(second.page))
      .toContain('TERMINAL_BEFORE_LOCAL_PROJECT_QUIT')
    await focusActiveTerminalInput(second.page)
    await second.page.keyboard.type('echo TERMINAL_AFTER_LOCAL_PROJECT_QUIT')
    await second.page.keyboard.press('Enter')
    await expect
      .poll(() => getTerminalContent(second.page))
      .toContain('TERMINAL_AFTER_LOCAL_PROJECT_QUIT')
    await openRootReadme(second.page, 'app_a')
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Main A restart draft'
    )
    await openRootReadme(second.page, 'app_b')
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Main B restart draft'
    )
    await second.page.locator(VISIBLE_TABS).filter({ hasText: 'Source page' }).click()
    await expect(second.page.locator('[data-orca-browser-address-bar="true"]:visible')).toHaveValue(
      browserServer.sourceUrl
    )
    await expect
      .poll(() =>
        second.app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .some(
                (contents) => contents.getURL() === url && contents.getTitle() === 'Source page'
              ),
          browserServer.sourceUrl
        )
      )
      .toBe(true)
    await second.page.screenshot({ path: testInfo.outputPath('restored-local-projects.png') })
    expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe('# app_a restart marker\n')
    expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b restart marker\n')
    expect(rendererErrors).toEqual([])
  } finally {
    await testInfo.attach('quit-diagnostics.txt', {
      body: closeDiagnostics.join('\n'),
      contentType: 'text/plain'
    })
    if (runningApp) {
      await session.close(runningApp).catch(() => undefined)
    }
    await session.dispose()
    await browserServer.close()
    rmSync(fixture, { recursive: true, force: true })
  }
})
