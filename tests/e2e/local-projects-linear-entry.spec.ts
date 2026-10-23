import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { createProject } from './helpers/local-project-controls'
import {
  connectLocalProjectLinearFixture,
  LOCAL_PROJECT_LINEAR_FIXTURE
} from './helpers/local-project-linear-backend'
import { waitForSessionReady } from './helpers/store'

const PROJECT = 'Linear entry acceptance'
const [, SECOND_ISSUE, NEW_ISSUE] = LOCAL_PROJECT_LINEAR_FIXTURE.issues
const WORKSPACE_NAME = 'eng-103-unattached-backlog-task'
const NEW_ISSUE_URL = `https://linear.app/ether-fixture/issue/${NEW_ISSUE.identifier}/fixture`
const SECOND_ISSUE_URL = `https://linear.app/ether-fixture/issue/${SECOND_ISSUE.identifier}/fixture`

function workspaceRows(page: Page) {
  return page.getByRole('region', { name: PROJECT, exact: true }).locator('[data-worktree-id]')
}

function workspaceRow(page: Page, name: string) {
  return workspaceRows(page).filter({ has: page.getByText(name, { exact: true }) })
}

function linksPopover(page: Page) {
  return page.locator('[data-slot="popover-content"]').filter({
    has: page.getByRole('heading', { name: 'Workspace Linear issues', exact: true })
  })
}

async function openJumpPalette(app: ElectronApplication, page: Page) {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('ui:toggleWorktreePalette')
  })
  const palette = page.getByRole('dialog', { name: 'Jump to...', exact: true })
  await expect(palette).toBeVisible()
  return palette
}

async function expectIssueComposer(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Workspace name', { exact: true })).toHaveValue(WORKSPACE_NAME)
  await expect(dialog.getByRole('status')).toContainText(
    `Link ${NEW_ISSUE.identifier} · ${NEW_ISSUE.title}`
  )
  await expect(dialog.getByLabel('Project', { exact: true })).toContainText(PROJECT)
  return dialog
}

test.use({ seedTestRepo: false })

test('creates one ticket-linked Workspace from Tasks and finds its second issue in Jump', async ({
  orcaPage: page,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const directory = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'ether-linear-entry-')))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(directory, { recursive: true, force: true })
  })
  writeFileSync(path.join(directory, 'README.md'), '# Linear entry fixture\n')
  await waitForSessionReady(page)
  await connectLocalProjectLinearFixture(electronApp, page)
  await createProject(page, PROJECT, [directory])
  await expect(workspaceRows(page)).toHaveCount(1)

  const previewPalette = await openJumpPalette(electronApp, page)
  const previewInput = previewPalette.getByRole('combobox')
  await previewInput.fill(NEW_ISSUE_URL)
  await expect(
    previewPalette.locator(
      '[data-cmd-j-linear-issue-preview="true"][data-cmd-j-linear-issue-state="resolved"]'
    )
  ).toContainText(NEW_ISSUE.title)
  await previewInput.press('Enter')
  const previewDialog = await expectIssueComposer(page)
  await previewDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(previewDialog).toHaveCount(0)
  await expect(workspaceRows(page)).toHaveCount(1)

  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await page.locator('[data-task-source="linear"]').click()
  await expect(page.getByRole('group', { name: 'Linear task mode', exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: `Workspaces for ${NEW_ISSUE.identifier}`, exact: true })
    .first()
    .click()
  await page.getByRole('option', { name: 'New Workspace for issue', exact: true }).click()
  const dialog = await expectIssueComposer(page)
  await page.screenshot({
    path: testInfo.outputPath('linear-ticket-workspace-intent.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(workspaceRows(page)).toHaveCount(2)
  await expect(workspaceRow(page, WORKSPACE_NAME)).toHaveCount(1)
  await expect(workspaceRow(page, WORKSPACE_NAME)).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Linear issues (1)', exact: true }).click()
  const links = linksPopover(page)
  await expect(links.getByRole('list', { name: 'Linked Linear issues' })).toContainText(
    NEW_ISSUE.identifier
  )
  await expect(links.getByRole('listitem')).toHaveCount(1)
  await links.getByPlaceholder('Search Linear issues…').fill(SECOND_ISSUE.identifier)
  await links.getByRole('option').filter({ hasText: SECOND_ISSUE.title }).click()
  await expect(links.getByRole('listitem')).toHaveCount(2)
  await expect(
    links.getByRole('button', { name: `Unlink ${SECOND_ISSUE.identifier}`, exact: true })
  ).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(links).toHaveCount(0)

  for (const query of [SECOND_ISSUE.identifier, SECOND_ISSUE.title, SECOND_ISSUE_URL]) {
    await workspaceRow(page, 'Main').click()
    await expect(workspaceRow(page, 'Main')).toHaveAttribute('aria-current', 'page')
    const palette = await openJumpPalette(electronApp, page)
    await palette.getByRole('combobox').fill(query)
    const match = palette.getByRole('option').filter({ hasText: `${PROJECT} / ${WORKSPACE_NAME}` })
    await expect(match).toHaveCount(1)
    await expect(match).toBeVisible()
    await expect(match).toContainText(SECOND_ISSUE.identifier)
    if (query === SECOND_ISSUE_URL) {
      await page.screenshot({
        path: testInfo.outputPath('linear-second-ticket-workspace-jump.png'),
        animations: 'disabled'
      })
    }
    await match.click()
    await expect(palette).toHaveCount(0)
    await expect(workspaceRow(page, WORKSPACE_NAME)).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'Linear issues (2)', exact: true })).toBeVisible()
    await expect(workspaceRows(page)).toHaveCount(2)
  }
})
