import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { createRestartSession } from './helpers/orca-restart'
import { createProject, createWorkspace, openRootReadme } from './helpers/local-project-controls'
import {
  connectLocalProjectLinearFixture,
  LOCAL_PROJECT_LINEAR_FIXTURE
} from './helpers/local-project-linear-backend'
import { waitForSessionReady } from './helpers/store'

const PROJECT = 'Linear acceptance'
const [SHARED_ISSUE, MAIN_ISSUE, UNLINKED_ISSUE] = LOCAL_PROJECT_LINEAR_FIXTURE.issues

// CSS, not role, lookup: the modal issue dialog aria-hides the sidebar while it is open.
function workspaceRow(page: Page, name: string) {
  return page
    .locator(`section[aria-label="${PROJECT}"] [data-worktree-id]`)
    .filter({ has: page.getByText(name, { exact: true }) })
}

function linksPopover(page: Page) {
  // The sidebar opens the manager in a dialog; the Workspace root bar still uses a popover.
  return page.locator('[data-slot="popover-content"], [data-slot="dialog-content"]').filter({
    has: page.getByRole('heading', { name: 'Workspace Linear issues', exact: true })
  })
}

/** Rows show the first key inline; every linked issue is named in that key's tooltip. */
function sidebarIssue(page: Page, name: string, issue: typeof SHARED_ISSUE) {
  return workspaceRow(page, name).locator(`[title*="${issue.identifier} ${issue.title}"]`)
}

async function openSidebarLinks(page: Page, name: string) {
  await page
    .getByRole('region', { name: PROJECT, exact: true })
    .getByRole('button', { name: `Workspace actions for ${name}`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Linear issues…', exact: true }).click()
  await expect(linksPopover(page)).toBeVisible()
}

async function openLinks(page: Page, count: number) {
  await page.getByRole('button', { name: `Linear issues (${count})`, exact: true }).click()
  await expect(linksPopover(page)).toBeVisible()
}

async function closeLinks(page: Page) {
  await page.keyboard.press('Escape')
  await expect(linksPopover(page)).toHaveCount(0)
}

async function attachIssue(page: Page, issue: typeof SHARED_ISSUE) {
  const popover = linksPopover(page)
  await popover.getByPlaceholder('Search Linear issues…').fill(issue.identifier)
  const option = popover.getByRole('option').filter({ hasText: issue.title })
  await expect(option).toBeVisible()
  await option.click()
  await expect(popover.getByRole('list', { name: 'Linked Linear issues' })).toContainText(
    issue.identifier
  )
  await expect(
    popover.getByRole('button', { name: `Unlink ${issue.identifier}`, exact: true })
  ).toBeEnabled()
}

async function editorSnapshot(page: Page, owner?: string) {
  return page.evaluate((requestedOwner) => {
    const state = window.__store?.getState()
    const id = requestedOwner ?? state?.activeWorktreeId
    if (!state || !id) {
      throw new Error('Workspace fixture has not loaded.')
    }
    return {
      owner: id,
      tabs: (state.unifiedTabsByWorktree[id] ?? []).map(
        ({ id, entityId, groupId, contentType }) => ({ id, entityId, groupId, contentType })
      ),
      files: state.openFiles
        .filter((file) => file.worktreeId === id)
        .map((file) => ({
          id: file.id,
          path: file.filePath,
          dirty: file.isDirty,
          draft: state.editorDrafts[file.id]
        })),
      layout: state.layoutByWorktree[id]
    }
  }, owner)
}

async function openLinearTasks(page: Page) {
  await page.evaluate(async () => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('Renderer store unavailable.')
    }
    await state.checkLinearConnection(true)
    state.openTaskPage({ taskSource: 'linear' })
  })
  await expect(page.getByRole('group', { name: 'Linear task mode' })).toBeVisible()
  await page.getByRole('button', { name: 'Has Workspace', exact: true }).click()
  await expect(
    page
      .getByRole('button', { name: `Workspaces for ${SHARED_ISSUE.identifier}`, exact: true })
      .first()
  ).toBeVisible()
}

test('links multiple Linear issues without coupling Workspace tabs and restores links after normal quit', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both isolated Electron launches.
{}, testInfo) => {
  const fixture = realpathSync.native(
    mkdtempSync(path.join(os.tmpdir(), 'ether-linear-workspaces-'))
  )
  const firstRoot = path.join(fixture, 'app_a')
  const secondRoot = path.join(fixture, 'app_b')
  for (const directory of [firstRoot, secondRoot]) {
    mkdirSync(directory)
    writeFileSync(
      path.join(directory, 'README.md'),
      `# ${path.basename(directory)} independent editor\n`
    )
  }
  const session = createRestartSession(testInfo)
  let runningApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    runningApp = first.app
    const page = first.page
    await waitForSessionReady(page)
    await connectLocalProjectLinearFixture(first.app, page)
    await createProject(page, PROJECT, [firstRoot, secondRoot])
    await openRootReadme(page, 'app_a')
    const main = await editorSnapshot(page)
    await openSidebarLinks(page, 'Main')
    await expect(linksPopover(page).getByPlaceholder('Search Linear issues…')).toBeEnabled()
    await expect(linksPopover(page).getByRole('option')).toHaveCount(0)
    await attachIssue(page, SHARED_ISSUE)
    await expect(sidebarIssue(page, 'Main', SHARED_ISSUE)).toContainText(SHARED_ISSUE.identifier)
    await linksPopover(page)
      .getByPlaceholder('Search Linear issues…')
      .fill(`https://linear.app/ether-fixture/issue/${MAIN_ISSUE.identifier}/fixture`)
    await linksPopover(page).getByRole('option').filter({ hasText: MAIN_ISSUE.title }).click()
    await expect(linksPopover(page).getByRole('listitem')).toHaveCount(2)
    await expect(sidebarIssue(page, 'Main', MAIN_ISSUE)).toContainText('+1')
    await linksPopover(page).getByPlaceholder('Search Linear issues…').fill('')
    await expect(linksPopover(page).getByRole('option')).toHaveCount(0)
    await linksPopover(page)
      .getByRole('button', { name: `Refresh ${MAIN_ISSUE.identifier} details`, exact: true })
      .click()
    await expect(
      linksPopover(page).getByRole('button', {
        name: `Refresh ${MAIN_ISSUE.identifier} details`,
        exact: true
      })
    ).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath('linear-workspace-two-issues.png'),
      animations: 'disabled'
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({
      path: testInfo.outputPath('linear-workspace-dark.png'),
      animations: 'disabled'
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass(/light/)
    await closeLinks(page)
    expect(await editorSnapshot(page)).toEqual(main)

    // At 220px the Linear key gives way to the name (drop order), so later checks assert presence.
    await page.evaluate(() => window.__store?.getState().setSidebarWidth(220))
    await expect
      .poll(() => workspaceRow(page, 'Main').evaluate((row) => row.scrollWidth <= row.clientWidth))
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath('linear-sidebar-light.png') })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({ path: testInfo.outputPath('linear-sidebar-dark.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await openSidebarLinks(page, 'Main')
    await expect
      .poll(() =>
        linksPopover(page).evaluate((popover) => {
          const bounds = popover.getBoundingClientRect()
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight
        })
      )
      .toBe(true)
    await linksPopover(page)
      .getByRole('button', { name: `Open ${MAIN_ISSUE.identifier} in Ether`, exact: true })
      .click()
    await expect(linksPopover(page)).toHaveCount(0)
    await expect(page.getByText(MAIN_ISSUE.title, { exact: true }).first()).toBeVisible()
    // Local links replace, not join, the single-workspace actions in issue details.
    await expect(page.getByRole('region', { name: 'Linked Workspaces', exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('button', { name: `Workspaces for ${MAIN_ISSUE.identifier}`, exact: true })
        .first()
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Start workspace from issue', exact: true })
    ).toHaveCount(0)
    await workspaceRow(page, 'Main').click()
    expect(await editorSnapshot(page)).toEqual(main)

    await createWorkspace(page, PROJECT, 'Review')
    await openRootReadme(page, 'app_b')
    const review = await editorSnapshot(page)
    expect(review.owner).not.toBe(main.owner)
    expect(review.files.every((file) => !main.files.some((other) => other.id === file.id))).toBe(
      true
    )
    await openLinks(page, 0)
    await attachIssue(page, SHARED_ISSUE)
    await closeLinks(page)
    await openSidebarLinks(page, 'Main')
    await expect(linksPopover(page).getByRole('listitem')).toHaveCount(2)
    await expect(workspaceRow(page, 'Review')).toHaveAttribute('aria-current', 'page')
    await closeLinks(page)
    expect(await editorSnapshot(page)).toEqual(review)
    expect(await editorSnapshot(page, main.owner)).toEqual(main)

    await openLinearTasks(page)
    await expect(page.getByText(UNLINKED_ISSUE.title, { exact: true })).toHaveCount(0)
    const sharedWorkspaces = page
      .getByRole('button', { name: `Workspaces for ${SHARED_ISSUE.identifier}`, exact: true })
      .first()
    await expect(sharedWorkspaces).toContainText('2')
    await sharedWorkspaces.click()
    const choice = page
      .locator('[data-slot="popover-content"]')
      .filter({ has: page.getByPlaceholder('Search Workspaces…') })
    await expect(choice.getByText(`${PROJECT} / Main`, { exact: true })).toBeVisible()
    await expect(choice.getByText(`${PROJECT} / Review`, { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('linear-task-workspace-chooser.png'),
      animations: 'disabled'
    })
    await choice.getByText(`${PROJECT} / Main`, { exact: true }).click()
    await expect(workspaceRow(page, 'Main')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.rich-markdown-editor:visible')).toContainText(
      'app_a independent editor'
    )
    expect(await editorSnapshot(page)).toEqual(main)

    await openLinks(page, 2)
    await linksPopover(page)
      .getByRole('button', { name: `Unlink ${SHARED_ISSUE.identifier}`, exact: true })
      .click()
    await expect(linksPopover(page).getByRole('listitem')).toHaveCount(1)
    await expect(
      linksPopover(page).getByRole('list', { name: 'Linked Linear issues' })
    ).not.toContainText(SHARED_ISSUE.identifier)
    await closeLinks(page)
    await expect(sidebarIssue(page, 'Main', MAIN_ISSUE)).toHaveCount(1)
    await expect(sidebarIssue(page, 'Main', SHARED_ISSUE)).toHaveCount(0)
    await expect(sidebarIssue(page, 'Review', SHARED_ISSUE)).toHaveCount(1)
    await workspaceRow(page, 'Review').click()
    await openLinks(page, 1)
    await expect(
      linksPopover(page).getByRole('list', { name: 'Linked Linear issues' })
    ).toContainText(SHARED_ISSUE.identifier)
    await closeLinks(page)
    expect(await editorSnapshot(page)).toEqual(review)
    expect(await editorSnapshot(page, main.owner)).toEqual(main)
    await page.screenshot({ path: testInfo.outputPath('linear-links-independent-workspaces.png') })

    const firstProcess = first.app.process()
    await session.close(first.app)
    runningApp = null
    expect(firstProcess.signalCode, 'Normal Quit must not force-kill Electron').toBeNull()
    expect(firstProcess.exitCode).toBe(0)
    const second = await session.launch()
    runningApp = second.app
    await waitForSessionReady(second.page)
    await connectLocalProjectLinearFixture(second.app, second.page)
    await expect(workspaceRow(second.page, 'Review')).toHaveAttribute('aria-current', 'page')
    await expect(sidebarIssue(second.page, 'Main', MAIN_ISSUE)).toHaveCount(1)
    await expect(sidebarIssue(second.page, 'Review', SHARED_ISSUE)).toHaveCount(1)
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'app_b independent editor'
    )
    expect(await editorSnapshot(second.page)).toEqual(review)
    await openLinks(second.page, 1)
    await expect(
      linksPopover(second.page).getByRole('list', { name: 'Linked Linear issues' })
    ).toContainText(SHARED_ISSUE.identifier)
    await closeLinks(second.page)
    await workspaceRow(second.page, 'Main').click()
    await openLinks(second.page, 1)
    const mainLinks = linksPopover(second.page).getByRole('list', { name: 'Linked Linear issues' })
    await expect(mainLinks).toContainText(MAIN_ISSUE.identifier)
    await expect(mainLinks).not.toContainText(SHARED_ISSUE.identifier)
    await closeLinks(second.page)
    expect(await editorSnapshot(second.page)).toEqual(main)
    await second.page.screenshot({ path: testInfo.outputPath('linear-links-restored.png') })
  } finally {
    if (runningApp) {
      await session.close(runningApp).catch(() => undefined)
    }
    await session.dispose()
    rmSync(fixture, { recursive: true, force: true })
  }
})
