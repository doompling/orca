import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { appendToReadme, createProject, openRootReadme } from './helpers/local-project-controls'
import { waitForActivePanePtyId, waitForActiveTerminalManager } from './helpers/terminal'

test.use({ seedTestRepo: false })

function plainRoots() {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-recovery-'))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  for (const directory of [appA, appB]) {
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'README.md'), `# ${path.basename(directory)} marker\n`)
  }
  return { fixture, appA, appB }
}

async function savedContexts(page: Page) {
  return page.evaluate(async () => {
    const snapshot = await window.api.localProjects.getSnapshot()
    return {
      projects: snapshot.projects.map(({ id, name, roots, defaultRootId }) => ({
        id,
        name,
        roots,
        defaultRootId
      })),
      workspaces: snapshot.workspaces.map(
        ({ id, name, projectId, defaultRootId, checkoutOverridesByRootId }) => ({
          id,
          name,
          projectId,
          defaultRootId,
          checkoutOverridesByRootId
        })
      )
    }
  })
}

async function localPtyIds(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await window.api.pty.listSessions({ connectionId: null })).map(({ id }) => id).sort()
  )
}

async function editScope(page: Page, kind: 'Project' | 'Workspace') {
  const project = page.getByRole('region', { name: 'Recovery project', exact: true })
  const name = kind === 'Project' ? 'Recovery project' : 'Main'
  await project.getByRole('button', { name: `${kind} actions for ${name}`, exact: true }).click()
  const title = kind === 'Project' ? 'Edit Project roots' : 'Edit Workspace checkouts'
  await page.getByRole('menuitem', { name: `${title}…`, exact: true }).click()
  return page.getByRole('dialog', { name: title, exact: true })
}

async function chooseWorkspaceDefaultB(page: Page) {
  const dialog = await editScope(page, 'Workspace')
  await dialog.getByLabel('Default command directory').click()
  await page.getByRole('option', { name: 'app_b', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save checkouts', exact: true }).click()
  return dialog
}

test('cancels creation and guards scope changes without losing drafts, terminals, or saved file targets', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const { fixture, appA, appB } = plainRoots()
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  const initialContexts = await savedContexts(page)
  const initialPtys = await localPtyIds(page)
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const projectDialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await projectDialog.getByLabel('Project name').fill('Canceled project')
  for (const directory of [appA, appB]) {
    await projectDialog.getByLabel('Directory path').fill(directory)
    await projectDialog.getByRole('button', { name: 'Add directory', exact: true }).click()
  }
  await projectDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(projectDialog).toHaveCount(0)
  expect(await savedContexts(page)).toEqual(initialContexts)
  expect(await localPtyIds(page)).toEqual(initialPtys)
  await expect(page.getByRole('region', { name: 'Canceled project', exact: true })).toHaveCount(0)

  await createProject(page, 'Recovery project', [appA, appB])
  const project = page.getByRole('region', { name: 'Recovery project', exact: true })
  const roots = page.getByRole('group', { name: 'Browse directory' })
  await expect(roots.getByRole('button')).toHaveCount(2)
  await waitForActiveTerminalManager(page)
  const ptyId = await waitForActivePanePtyId(page)
  const terminalId = await page
    .locator('[data-testid="sortable-tab"][data-active="true"]:visible')
    .getAttribute('data-tab-id')
  const terminalTab = page.locator(`[data-testid="sortable-tab"][data-tab-id="${terminalId}"]`)
  const projectPtys = await localPtyIds(page)
  const saved = await savedContexts(page)
  await project.getByRole('button', { name: 'New Workspace in Recovery project' }).click()
  const workspaceDialog = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await workspaceDialog.getByLabel('Workspace name').fill('Canceled task')
  await workspaceDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(workspaceDialog).toHaveCount(0)
  expect(await savedContexts(page)).toEqual(saved)
  expect(await localPtyIds(page)).toEqual(projectPtys)
  await expect(project.locator('[data-worktree-id]')).toHaveCount(1)
  await expect(project.getByText('Canceled task', { exact: true })).toHaveCount(0)

  await openRootReadme(page, 'app_b')
  await appendToReadme(page, 'Keep this draft until explicitly discarded')
  const rootsDialog = await editScope(page, 'Project')
  await rootsDialog.getByRole('button', { name: 'Remove app_b', exact: true }).click()
  await rootsDialog.getByRole('button', { name: 'Save roots', exact: true }).click()
  await expect(rootsDialog.getByRole('alert')).toContainText('Save or discard unsaved edits')
  expect(await savedContexts(page)).toEqual(saved)
  await rootsDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(roots.getByRole('button', { name: 'app_b', exact: true })).toBeVisible()

  const dirtyCheckouts = await chooseWorkspaceDefaultB(page)
  await expect(dirtyCheckouts.getByRole('alert')).toContainText('Save or discard unsaved edits')
  expect(await savedContexts(page)).toEqual(saved)
  await page.screenshot({ path: testInfo.outputPath('dirty-scope-change-refused.png') })
  await dirtyCheckouts.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Default command directory: app_a', { exact: true })).toBeVisible()
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText(
    'Keep this draft until explicitly discarded'
  )

  const dirtyTab = page.locator('[data-tab-id][data-active="true"]:visible')
  await dirtyTab.hover()
  await dirtyTab.getByRole('button', { name: 'Close tab', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Unsaved Changes', exact: true })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: "Don't Save", exact: true }).click()
  await expect(discard).toHaveCount(0)
  expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b marker\n')

  await openRootReadme(page, 'app_b')
  const savedTabId = await page
    .locator('[data-tab-id][data-active="true"]:visible')
    .getAttribute('data-tab-id')
  expect(savedTabId).toBeTruthy()
  const savedTab = page.locator(`[data-tab-id="${savedTabId}"]:visible`)
  await savedTab.dblclick()
  await openRootReadme(page, 'app_a')
  const liveCheckouts = await chooseWorkspaceDefaultB(page)
  await expect(liveCheckouts.getByRole('alert')).toContainText('Close running or reconnecting')
  expect(await savedContexts(page)).toEqual(saved)
  expect(await page.evaluate((id) => window.api.pty.hasPty(id), ptyId)).toBe(true)
  await liveCheckouts.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(terminalTab).toBeVisible()

  await terminalTab.hover()
  await terminalTab.getByRole('button', { name: /^Close tab /i }).click()
  const stop = page.getByRole('dialog', { name: 'Stop running command?', exact: true })
  await expect
    .poll(async () => (await stop.isVisible()) || (await terminalTab.count()) === 0)
    .toBe(true)
  if (await stop.isVisible()) {
    await stop.getByRole('button', { name: 'Stop and Close', exact: true }).click()
  }
  await expect(terminalTab).toHaveCount(0)
  await expect.poll(() => localPtyIds(page)).toEqual(initialPtys)
  await expect(page.locator('[data-testid="sortable-tab"]:visible')).toHaveCount(0)
  const cleanCheckouts = await chooseWorkspaceDefaultB(page)
  await expect(cleanCheckouts).toHaveCount(0)
  await expect(page.getByText('Default command directory: app_b', { exact: true })).toBeVisible()
  const cleanRoots = await editScope(page, 'Project')
  await cleanRoots.getByRole('button', { name: 'Remove app_b', exact: true }).click()
  await cleanRoots.getByRole('button', { name: 'Save roots', exact: true }).click()
  await expect(cleanRoots).toHaveCount(0)
  await expect(roots.getByRole('button')).toHaveCount(1)
  await expect(page.getByText('Default command directory: app_a', { exact: true })).toBeVisible()

  await expect(savedTab).toHaveCount(0)
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText('app_a marker')
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe('# app_a marker\n')
  expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b marker\n')
  const restoreRoots = await editScope(page, 'Project')
  await restoreRoots.getByLabel('Directory path').fill(appB)
  await restoreRoots.getByRole('button', { name: 'Add directory', exact: true }).click()
  await restoreRoots.getByRole('button', { name: 'Save roots', exact: true }).click()
  await expect(restoreRoots).toHaveCount(0)
  await openRootReadme(page, 'app_b')
  await expect(page.locator('.rich-markdown-editor:visible')).toContainText('app_b marker')
  await page.screenshot({ path: testInfo.outputPath('removed-root-file-reopens-unchanged.png') })
})

test('reports a missing selected directory and refuses to start a terminal elsewhere', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const { fixture, appA, appB } = plainRoots()
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  await createProject(page, 'Recovery project', [appA, appB])
  await waitForActiveTerminalManager(page)
  await waitForActivePanePtyId(page)
  const saved = await savedContexts(page)
  const before = await localPtyIds(page)
  renameSync(appB, path.join(fixture, 'app_b_moved'))
  await page
    .getByRole('group', { name: 'Browse directory' })
    .getByRole('button', { name: 'app_b', exact: true })
    .click()
  await page.getByRole('button', { name: 'Terminal in this directory', exact: true }).click()
  const error = page.locator('[data-terminal-error-toast]:visible')
  await expect(error).toBeVisible({ timeout: 20_000 })
  await expect(error).toContainText(/missing|not found|does not exist|cannot find|no such|ENOENT/i)
  await expect(error).toContainText('app_b')
  expect(await localPtyIds(page)).toEqual(before)
  expect(await savedContexts(page)).toEqual(saved)
  expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe('# app_a marker\n')
  await expect(page.getByText('Default command directory: app_a', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('missing-root-launch-refused.png') })
})
