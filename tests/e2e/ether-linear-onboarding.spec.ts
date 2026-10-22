import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@stablyai/playwright-test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertElectronResolvedIsolatedHome,
  createElectronHomeIsolation
} from './helpers/electron-home-isolation'
import { retryTransientMainEvaluate } from './helpers/electron-main-evaluate-retry'
import { cleanupE2EDaemons, closeElectronAppForE2E } from './helpers/electron-process-shutdown'
import { createProject } from './helpers/local-project-controls'
import {
  installLocalProjectLinearFetch,
  LOCAL_PROJECT_LINEAR_FIXTURE
} from './helpers/local-project-linear-backend'

async function openTaskSources(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Task Sources', exact: true }).click()
  const expand = page.getByRole('button', { name: 'Show Linear setup steps', exact: true })
  if (await expand.isVisible()) {
    await expand.click()
  }
  await expect(page.getByText('Optional: Linear agent skill', { exact: true })).toBeVisible()
}

async function openTasks(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await expect(page.locator('[data-task-source="linear"]')).toBeVisible()
  await page.locator('[data-task-source="linear"]').click()
}

async function expectIssues(page: Page): Promise<void> {
  await expect(page.getByRole('group', { name: 'Linear task mode', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: LOCAL_PROJECT_LINEAR_FIXTURE.issues[0].title, exact: true })
  ).toBeVisible()
}

test('packaged Ether exposes Linear before connection and browses without an agent skill', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both isolated packaged launches.
{}, testInfo) => {
  test.skip(process.platform !== 'darwin' || process.arch !== 'arm64')
  const bundle = process.env.ETHER_E2E_APP ?? 'dist/ether/mac-arm64/Ether.app'
  const executablePath = path.join(path.resolve(bundle), 'Contents', 'MacOS', 'Ether')
  test.skip(!existsSync(executablePath), 'Build the local Ether package first')
  const fixture = realpathSync.native(
    mkdtempSync(path.join(os.tmpdir(), 'ether-linear-onboarding-'))
  )
  const userDataDir = path.join(fixture, 'profile')
  const stallCheck = process.env.ETHER_LINEAR_STALL_CHECK === '1'
  const excluded = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_RENDERER_URL',
    'VITE_DEV_SERVER_URL',
    'ORCA_DEV_USER_DATA_PATH',
    'ORCA_USER_DATA_PATH',
    'ORCA_E2E_HEADFUL',
    'ORCA_E2E_FOREGROUND',
    'ORCA_E2E_TERMINAL_PERF_XVFB',
    'ORCA_RELAY_PATH'
  ])
  const isolation = createElectronHomeIsolation({
    inheritedEnv: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !excluded.has(key))
    ),
    launchEnv: {
      NODE_ENV: 'production',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_E2E_HEADLESS: '1'
    },
    extraEnv: {},
    userDataDir
  })
  let runningApp: ElectronApplication | null = null
  const launch = async () => {
    const app = await electron.launch({
      executablePath,
      cwd: fixture,
      args: [
        '--password-store=basic',
        '--use-mock-keychain',
        '-ApplePersistenceIgnoreState',
        'YES'
      ],
      env: { ...isolation.env, ORCA_BACKGROUND_LAUNCH: '1' }
    })
    runningApp = app
    const home = await retryTransientMainEvaluate(() =>
      app.evaluate(({ app }) => app.getPath('home'))
    )
    assertElectronResolvedIsolatedHome(home, isolation)
    await app.evaluate(installLocalProjectLinearFetch, {
      ...LOCAL_PROJECT_LINEAR_FIXTURE,
      latencyMs: 1000,
      ...(stallCheck ? { stallOperationsOnce: ['OrcaLinearProjects'] } : {})
    })
    const page = await app.firstWindow()
    page.setDefaultTimeout(10_000)
    const windows = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        focused: window.isFocused()
      }))
    )
    expect(windows.every((window) => !window.visible && !window.focused)).toBe(true)
    return { app, page }
  }
  try {
    const { app, page } = await launch()
    await expect(page.getByRole('heading', { name: 'Pick your default agent' })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Yolo / Dangerously skip permissions' }).uncheck()
    await page
      .locator('[data-onboarding-overlay] footer')
      .getByRole('button', { name: /^Continue/ })
      .click()
    await page.getByRole('button', { name: 'Skip to project setup', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'New Project', exact: true })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await page.getByRole('button', { name: 'Tasks', exact: true }).hover()
    await expect(page.getByRole('button', { name: 'Open Linear tasks', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open Linear tasks', exact: true }).click()
    await expect(page.locator('[data-task-source="linear"]')).toBeVisible()
    await expect(page.getByText('Connect your Linear account', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('linear-before-connection.png') })

    await page.getByRole('button', { name: 'Add Linear access', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Add Linear access', exact: true })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.locator('[data-task-source="linear"]')).toBeVisible()
    await page.getByRole('button', { name: 'Add Linear access', exact: true }).click()
    await dialog
      .getByLabel('Personal API key', { exact: true })
      .fill('lin_api_ether_fixture_not_a_real_credential')
    await dialog.getByRole('button', { name: 'Add Linear access', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expectIssues(page)
    await page.screenshot({ path: testInfo.outputPath('linear-tasks-connected.png') })
    const modes = page.getByRole('group', { name: 'Linear task mode', exact: true })
    await modes.getByRole('button', { name: 'Projects', exact: true }).click()
    if (stallCheck) {
      await expect(page.getByText(/Linear read timed out after 30 seconds/)).toBeVisible({
        timeout: 35_000
      })
      await expect(page.getByText('Unable to load Linear projects', { exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('linear-stalled-read-error.png') })
      await page.getByRole('button', { name: 'Refresh Linear', exact: true }).click()
    }
    await expect(
      page.getByText(LOCAL_PROJECT_LINEAR_FIXTURE.project.name, { exact: true })
    ).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('linear-projects.png') })
    await modes.getByRole('button', { name: 'Views', exact: true }).click()
    for (const view of LOCAL_PROJECT_LINEAR_FIXTURE.views) {
      await expect(page.getByText(view.name, { exact: true })).toBeVisible()
    }
    await page.screenshot({ path: testInfo.outputPath('linear-views.png') })
    await modes.getByRole('button', { name: 'Issues', exact: true }).click()
    await expectIssues(page)

    await openTaskSources(page)
    await expect(page.getByText('Skill required', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('linear-ready-with-optional-skill.png') })
    await page.getByRole('button', { name: 'Hide Linear from Tasks', exact: true }).click()
    await page.getByRole('button', { name: 'Back to app', exact: true }).click()
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    await expect(page.locator('[data-task-source="linear"]')).toHaveCount(0)
    await openTaskSources(page)
    await page.getByRole('button', { name: 'Show Linear in Tasks', exact: true }).click()
    await page.getByRole('button', { name: 'Back to app', exact: true }).click()
    await openTasks(page)
    await expectIssues(page)

    const projectRoot = path.join(fixture, 'app')
    mkdirSync(projectRoot)
    await createProject(page, 'Sidebar Linear', [projectRoot])
    const sidebar = page.getByRole('region', { name: 'Sidebar Linear', exact: true })
    const openManager = async () => {
      await sidebar.getByRole('button', { name: 'Workspace actions for Main', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Linear issues…', exact: true }).click()
    }
    await openManager()
    const manager = page.locator('[data-slot="dialog-content"]').filter({
      has: page.getByRole('heading', { name: 'Workspace Linear issues', exact: true })
    })
    await expect(manager.getByPlaceholder('Search Linear issues…')).toBeEnabled()
    await expect(manager.getByRole('option')).toHaveCount(0)
    for (const issue of LOCAL_PROJECT_LINEAR_FIXTURE.issues.slice(0, 2)) {
      await manager.getByPlaceholder('Search Linear issues…').fill(issue.identifier)
      await manager.getByRole('option').filter({ hasText: issue.title }).click()
      await expect(
        manager.getByRole('button', { name: `Unlink ${issue.identifier}`, exact: true })
      ).toBeEnabled()
    }
    await manager.getByPlaceholder('Search Linear issues…').fill('')
    await expect(manager.getByRole('option')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(manager).toHaveCount(0)
    // The row shows the first key and "+1"; its tooltip names both issues.
    const [firstIssue, secondIssue] = LOCAL_PROJECT_LINEAR_FIXTURE.issues
    const keys = sidebar.locator(`[title*="${firstIssue.identifier} ${firstIssue.title}"]`)
    await expect(keys).toHaveText(`${firstIssue.identifier} +1`)
    await expect(
      sidebar.locator(`[title*="${secondIssue.identifier} ${secondIssue.title}"]`)
    ).toHaveCount(1)
    await openManager()
    await expect(manager.getByRole('listitem')).toHaveCount(2)
    await page.screenshot({
      path: testInfo.outputPath('linear-sidebar-linked-issues.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')

    const child = app.process()
    await closeElectronAppForE2E(app)
    runningApp = null
    expect(child.signalCode).toBeNull()
    expect(child.exitCode).toBe(0)
    const reopened = await launch()
    const cliTip = reopened.page.getByRole('dialog', {
      name: 'Let agents drive Orca with the Orca CLI',
      exact: true
    })
    const tipVisible = await cliTip
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    if (tipVisible) {
      await cliTip.getByRole('button', { name: 'Close', exact: true }).click()
    }
    await expect(
      reopened.page.locator(`[title*="${LOCAL_PROJECT_LINEAR_FIXTURE.issues[0].identifier} "]`)
    ).toHaveText(`${LOCAL_PROJECT_LINEAR_FIXTURE.issues[0].identifier} +1`)
    await openTasks(reopened.page)
    await expectIssues(reopened.page)
    await reopened.page.screenshot({ path: testInfo.outputPath('linear-after-reopen.png') })
  } finally {
    if (runningApp) {
      await closeElectronAppForE2E(runningApp)
    }
    await cleanupE2EDaemons(userDataDir)
    rmSync(fixture, { recursive: true, force: true })
  }
})
