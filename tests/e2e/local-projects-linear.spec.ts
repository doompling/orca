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

function workspaceRow(page: Page, name: string) {
  return page
    .getByRole('region', { name: PROJECT, exact: true })
    .locator('[data-worktree-id]')
    .filter({ has: page.getByText(name, { exact: true }) })
}

function linksPopover(page: Page) {
  return page.locator('[data-slot="popover-content"]').filter({
    has: page.getByRole('heading', { name: 'Workspace Linear issues', exact: true })
  })
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
    await openLinks(page, 0)
    await attachIssue(page, SHARED_ISSUE)
    await attachIssue(page, MAIN_ISSUE)
    await expect(linksPopover(page).getByRole('listitem')).toHaveCount(2)
    await page.screenshot({
      path: testInfo.outputPath('linear-workspace-two-issues.png'),
      animations: 'disabled'
    })
    await closeLinks(page)
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
