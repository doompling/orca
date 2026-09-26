import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { quoteStartupArg } from '../../src/shared/tui-agent-startup-shell'
import { test, expect } from './helpers/orca-app'
import { cleanupTestRepository } from './global-teardown'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { createGoldenWorktree } from './helpers/golden-source-control'
import { createRestartSession } from './helpers/orca-restart'
import { appendToReadme, createProject, openRootReadme } from './helpers/local-project-controls'
import {
  installLocalProjectScriptedChat,
  SCRIPTED_CHAT_MESSAGE,
  SCRIPTED_CHAT_RESPONSE
} from './helpers/local-project-scripted-chat'
import { waitForSessionReady } from './helpers/store'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'

const PROJECT = 'Copy file layout'
const VISIBLE_TABS = '[data-tab-group-strip-id]:visible [data-tab-id][data-active]'

function workspaceRow(page: Page, name: string) {
  return page
    .getByRole('region', { name: PROJECT, exact: true })
    .locator('[data-worktree-id]')
    .filter({ has: page.getByText(name, { exact: true }) })
}

async function workspaceSnapshot(page: Page, owner?: string) {
  return page.evaluate((requestedOwner) => {
    const state = window.__store?.getState()
    const worktreeId = requestedOwner ?? state?.activeWorktreeId
    if (!state || !worktreeId) {
      throw new Error('The fixture Workspace has not loaded')
    }
    return {
      owner: worktreeId,
      tabs: (state.unifiedTabsByWorktree[worktreeId] ?? []).map(
        ({ id, entityId, groupId, contentType }) => ({ id, entityId, groupId, contentType })
      ),
      files: state.openFiles
        .filter((file) => file.worktreeId === worktreeId)
        .map((file) => ({
          id: file.id,
          path: file.filePath,
          dirty: file.isDirty,
          draft: state.editorDrafts[file.id]
        })),
      groups: (state.groupsByWorktree[worktreeId] ?? []).map(({ id, tabOrder }) => ({
        id,
        tabOrder
      })),
      layout: state.layoutByWorktree[worktreeId]
    }
  }, owner)
}

type WorkspaceSnapshot = Awaited<ReturnType<typeof workspaceSnapshot>>

function fileTab(snapshot: WorkspaceSnapshot, filePath: string) {
  const file = snapshot.files.find((entry) => entry.path === filePath)
  const tab = snapshot.tabs.find((entry) => entry.entityId === file?.id)
  if (!file || !tab) {
    throw new Error(`Expected a saved-file tab for ${filePath}`)
  }
  return tab
}

function editorFor(page: Page, tab: { groupId: string }) {
  return page.locator(`[data-tab-group-body-id="${tab.groupId}"] .rich-markdown-editor:visible`)
}

async function localPtyIds(page: Page) {
  return page.evaluate(async () =>
    (await window.api.pty.listSessions({ connectionId: null })).map(({ id }) => id).sort()
  )
}

async function copyWorkspace(
  page: Page,
  name: string,
  alternate?: { label: string; path: string }
) {
  await page.getByRole('button', { name: `New Workspace in ${PROJECT}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await dialog.getByLabel('Workspace name').fill(name)
  await expect(dialog.getByLabel('Copy saved file tabs from')).toContainText('Do not copy')
  await dialog.getByLabel('Copy saved file tabs from').click()
  await page.getByRole('option', { name: 'Main', exact: true }).click()
  if (alternate) {
    await dialog.getByRole('button', { name: 'Choose worktrees', exact: true }).click()
    await dialog.getByLabel(`${alternate.label} existing worktree path`).fill(alternate.path)
  }
  await dialog.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(workspaceRow(page, name)).toHaveAttribute('aria-current', 'page')
}

async function expectSideBySideFiles(page: Page, snapshot: WorkspaceSnapshot, paths: string[]) {
  await expect(page.locator('[data-tab-group-strip-id]:visible')).toHaveCount(2)
  await expect(page.locator(VISIBLE_TABS)).toHaveCount(2)
  const [left, right] = paths.map((filePath) => fileTab(snapshot, filePath))
  const leftEditor = editorFor(page, left)
  const rightEditor = editorFor(page, right)
  await expect(leftEditor).toContainText('Source A saved file')
  await expect(rightEditor).toContainText('Source B saved file')
  const leftBox = await leftEditor.boundingBox()
  const rightBox = await rightEditor.boundingBox()
  if (!leftBox || !rightBox) {
    throw new Error('Copied file split did not render both editors')
  }
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x + 2)
  await expect(page.locator('[data-testid="sortable-tab"]:visible')).toHaveCount(0)
  await expect(page.locator('[data-native-chat-root="true"]:visible')).toHaveCount(0)
}

test('copies only clean saved-file splits into independent Workspaces and retains them after normal quit', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both Electron launches.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'The scripted source-agent fixture is POSIX-only')
  const fixture = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'orca-copy-file-layout-')))
  const appA = createSeededTestRepo({ publishPath: false })
  const alternate = createGoldenWorktree(appA, 'copy-layout')
  const appB = path.join(fixture, 'app_b')
  const scriptedDirectory = path.join(fixture, 'scripted-cli')
  mkdirSync(appB)
  mkdirSync(scriptedDirectory)
  const scripted = installLocalProjectScriptedChat(scriptedDirectory)
  const labelA = path.basename(appA)
  const readmeA = path.join(appA, 'README.md')
  const readmeB = path.join(appB, 'README.md')
  const dirtyPath = path.join(appA, 'draft.md')
  writeFileSync(readmeA, '# Source A saved file\n')
  writeFileSync(readmeB, '# Source B saved file\n')
  writeFileSync(dirtyPath, '# Source dirty file\n')
  const alternateReadme = path.join(alternate.worktreePath, 'README.md')
  writeFileSync(alternateReadme, '# Alternate A must not open automatically\n')
  const session = createRestartSession(testInfo, {
    SHELL: '/bin/bash',
    PATH: `${scriptedDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
    ORCA_SDK_CONTRACT_SCENARIO_PATH: scripted.scenarioPath,
    ORCA_SDK_CONTRACT_REPORT_PATH: scripted.reportPath
  })
  writeFileSync(
    path.join(session.userDataDir, 'home', '.bash_profile'),
    `export PATH=${quoteStartupArg(scriptedDirectory, 'posix')}:"$PATH"\n`
  )
  let runningApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    runningApp = first.app
    const page = first.page
    await waitForSessionReady(page)
    await page.evaluate(async () => {
      await window.__store?.getState().updateSettings({
        experimentalNativeChat: true,
        experimentalStructuredNativeChat: true,
        openAgentTabsInChatByDefault: true,
        agentDefaultArgs: { claude: '' }
      })
    })
    await createProject(page, PROJECT, [appA, appB])
    await waitForActiveTerminalManager(page)
    await waitForActivePanePtyId(page)
    await first.app.evaluate((_electron, directory) => {
      process.env.PATH = `${directory}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
    }, scriptedDirectory)
    await page.getByRole('button', { name: 'New tab', exact: true }).last().click()
    await page.getByRole('menuitem', { name: /^Claude(?:\s|$)/ }).click()
    const chat = page.locator('[data-native-chat-root="true"]:visible')
    await expect(chat.getByRole('textbox')).toBeEditable({ timeout: 20_000 })
    await chat.getByRole('textbox').fill(SCRIPTED_CHAT_MESSAGE)
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(chat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()).toBeVisible({
      timeout: 20_000
    })

    await openRootReadme(page, labelA)
    let current = await workspaceSnapshot(page)
    await page.locator(`[data-tab-id="${fileTab(current, readmeA).id}"]:visible`).dblclick()
    await page.getByRole('textbox', { name: 'Find files', exact: true }).fill('draft.md')
    await page
      .locator('[data-orca-explorer-shell] [data-file-explorer-row]')
      .filter({
        has: page.locator('[data-file-explorer-row-name]').getByText('draft.md', { exact: true })
      })
      .dblclick()
    await expect(page.locator('.rich-markdown-editor:visible')).toContainText('Source dirty file')
    await appendToReadme(page, 'Source-only unsaved draft')
    await openRootReadme(page, 'app_b')
    current = await workspaceSnapshot(page)
    const sourceB = fileTab(current, readmeB)
    await page.locator(`[data-tab-id="${sourceB.id}"]:visible`).dblclick()
    await page.locator(`[data-tab-id="${sourceB.id}"]:visible`).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Move Tab to Split', exact: true }).hover()
    await page.getByRole('menuitem', { name: 'Right', exact: true }).click()
    await expect(page.locator('[data-tab-group-strip-id]:visible')).toHaveCount(2)
    await page.locator(`[data-tab-id="${fileTab(current, readmeA).id}"]:visible`).click()
    const source = await workspaceSnapshot(page)
    expect(source.tabs.some((tab) => tab.contentType === 'terminal')).toBe(true)
    expect(source.tabs.some((tab) => tab.contentType === 'agent-session')).toBe(true)
    expect(source.files.find((file) => file.path === dirtyPath)?.dirty).toBe(true)
    const sourcePtys = await localPtyIds(page)

    await copyWorkspace(page, 'Copied task')
    const copied = await workspaceSnapshot(page)
    expect(copied.files.map((file) => file.path).sort()).toEqual([readmeA, readmeB].sort())
    expect(copied.tabs.every((tab) => tab.contentType === 'editor')).toBe(true)
    expect(
      copied.tabs.every(
        (tab) =>
          !source.tabs.some((other) => other.id === tab.id || other.entityId === tab.entityId)
      )
    ).toBe(true)
    expect(
      copied.groups.every((group) => !source.groups.some((other) => other.id === group.id))
    ).toBe(true)
    expect(await workspaceSnapshot(page, source.owner)).toEqual(source)
    expect(await localPtyIds(page)).toEqual(sourcePtys)
    await expectSideBySideFiles(page, copied, [readmeA, readmeB])
    await expect(page.locator(VISIBLE_TABS).filter({ hasText: 'draft.md' })).toHaveCount(0)
    const copiedA = fileTab(copied, readmeA)
    await editorFor(page, copiedA).click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Copied task independent draft')
    await expect(editorFor(page, copiedA)).toContainText('Copied task independent draft')
    await page.screenshot({ path: testInfo.outputPath('copied-file-splits.png') })

    await workspaceRow(page, 'Main').click()
    await expect(editorFor(page, fileTab(source, readmeA))).not.toContainText(
      'Copied task independent draft'
    )
    const sourceDirty = fileTab(source, dirtyPath)
    await page.locator(`[data-tab-id="${sourceDirty.id}"]:visible`).click()
    await expect(editorFor(page, sourceDirty)).toContainText('Source-only unsaved draft')
    await expect(page.locator(VISIBLE_TABS)).toHaveCount(source.tabs.length)
    await copyWorkspace(page, 'Alternate copy', { label: labelA, path: alternate.worktreePath })
    const filtered = await workspaceSnapshot(page)
    expect(filtered.files.map((file) => file.path)).toEqual([readmeB])
    await expect(page.locator('[data-tab-group-strip-id]:visible')).toHaveCount(1)
    await expect(page.locator(VISIBLE_TABS)).toHaveCount(1)
    await expect(editorFor(page, fileTab(filtered, readmeB))).toContainText('Source B saved file')
    await expect(
      page
        .getByRole('group', { name: 'Browse directory' })
        .getByRole('button', { name: labelA, exact: true })
    ).toHaveAttribute('title', alternate.worktreePath)
    expect(await localPtyIds(page)).toEqual(sourcePtys)
    await workspaceRow(page, 'Copied task').click()
    await expect(editorFor(page, copiedA)).toContainText('Copied task independent draft')
    const beforeQuit = await workspaceSnapshot(page)
    const child = first.app.process()
    await session.close(first.app)
    runningApp = null
    expect(child.signalCode, 'Normal Quit must not force-kill Electron').toBeNull()
    expect(child.exitCode).toBe(0)

    const second = await session.launch()
    runningApp = second.app
    await waitForSessionReady(second.page)
    await expect(workspaceRow(second.page, 'Copied task')).toHaveAttribute('aria-current', 'page')
    await expectSideBySideFiles(second.page, copied, [readmeA, readmeB])
    await expect(editorFor(second.page, copiedA)).toContainText('Copied task independent draft')
    expect(await workspaceSnapshot(second.page)).toEqual(beforeQuit)
    await second.page.screenshot({ path: testInfo.outputPath('copied-file-splits-restored.png') })
    await workspaceRow(second.page, 'Main').click()
    await second.page.locator(`[data-tab-id="${sourceDirty.id}"]:visible`).click()
    await expect(editorFor(second.page, sourceDirty)).toContainText('Source-only unsaved draft')
    await second.page.locator(`[data-tab-id="${fileTab(source, readmeA).id}"]:visible`).click()
    await expect(editorFor(second.page, fileTab(source, readmeA))).not.toContainText(
      'Copied task independent draft'
    )
    expect(readFileSync(readmeA, 'utf8')).toBe('# Source A saved file\n')
    expect(readFileSync(readmeB, 'utf8')).toBe('# Source B saved file\n')
    expect(readFileSync(dirtyPath, 'utf8')).toBe('# Source dirty file\n')
    expect(readFileSync(alternateReadme, 'utf8')).toBe(
      '# Alternate A must not open automatically\n'
    )
    const finalChild = second.app.process()
    await session.close(second.app)
    runningApp = null
    expect(finalChild.signalCode).toBeNull()
    expect(finalChild.exitCode).toBe(0)
  } finally {
    if (runningApp) {
      await session.close(runningApp).catch(() => undefined)
    }
    await session.dispose()
    cleanupTestRepository(appA)
    rmSync(fixture, { recursive: true, force: true })
  }
})
