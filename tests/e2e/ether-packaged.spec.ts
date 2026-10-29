import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@stablyai/playwright-test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertElectronResolvedIsolatedHome,
  createElectronHomeIsolation
} from './helpers/electron-home-isolation'
import { retryTransientMainEvaluate } from './helpers/electron-main-evaluate-retry'
import { cleanupE2EDaemons, closeElectronAppForE2E } from './helpers/electron-process-shutdown'
import { appendToReadme, createProject, openRootReadme } from './helpers/local-project-controls'
import { defaultEtherReleaseBundle } from './helpers/ether-release-bundle'
import { closeFeatureTips } from './helpers/ether-feature-tips'

function packagedExecutable(): string | null {
  const explicitBundle = process.env.ETHER_E2E_APP
  if (explicitBundle !== undefined && !explicitBundle.trim()) {
    throw new Error('ETHER_E2E_APP must name an existing Ether.app bundle')
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    if (explicitBundle !== undefined) {
      throw new Error('The local Ether package smoke requires an Apple Silicon Mac')
    }
    return null
  }
  const bundle = path.resolve(explicitBundle ?? defaultEtherReleaseBundle())
  const executable = path.join(bundle, 'Contents', 'MacOS', 'Ether')
  if (!existsSync(executable)) {
    if (explicitBundle !== undefined) {
      throw new Error(`The explicitly requested Ether executable is missing: ${executable}`)
    }
    return null
  }
  return executable
}

function productionLaunchEnvironment(): NodeJS.ProcessEnv {
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
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !excluded.has(key)))
}

async function normalQuit(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await closeElectronAppForE2E(app)
  expect(child.signalCode, 'Normal quit must not need a forced termination').toBeNull()
  expect(child.exitCode).toBe(0)
}

test('packaged Ether starts from an empty profile, saves both directory contexts and restores a draft', async (// oxlint-disable-next-line no-empty-pattern -- this test owns the packaged Electron launches.
{}, testInfo) => {
  const executablePath = packagedExecutable()
  test.skip(!executablePath, 'Build the local Apple Silicon package, or set ETHER_E2E_APP')
  if (!executablePath) {
    return
  }
  const fixture = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'ether-packaged-')))
  const userDataDir = path.join(fixture, 'profile')
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  for (const directory of [appA, appB]) {
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'README.md'), `# ${path.basename(directory)}\n`)
  }
  const isolation = createElectronHomeIsolation({
    inheritedEnv: productionLaunchEnvironment(),
    launchEnv: {
      NODE_ENV: 'production',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_E2E_HEADLESS: '1'
    },
    extraEnv: {},
    userDataDir
  })
  const active: { app: ElectronApplication | null; page: Page | null } = {
    app: null,
    page: null
  }
  const rendererErrors: string[] = []
  const launch = async (firstLaunch = false): Promise<{ app: ElectronApplication; page: Page }> => {
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
    active.app = app
    const metadata = await retryTransientMainEvaluate(() =>
      app.evaluate(({ app, BrowserWindow }) => ({
        isPackaged: app.isPackaged,
        name: app.getName(),
        home: app.getPath('home'),
        userData: app.getPath('userData'),
        cwd: process.cwd(),
        windows: BrowserWindow.getAllWindows().map((window) => ({
          visible: window.isVisible(),
          focused: window.isFocused()
        }))
      }))
    )
    assertElectronResolvedIsolatedHome(metadata.home, isolation)
    expect(metadata.isPackaged).toBe(true)
    expect(metadata.name).toBe('Ether')
    expect(metadata.userData).toBe(userDataDir)
    expect(metadata.cwd).toBe(fixture)
    const page = await app.firstWindow({ timeout: 60_000 })
    active.page = page
    page.on('pageerror', (error) => rendererErrors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    if (firstLaunch) {
      await expect(page.getByRole('heading', { name: 'Pick your default agent' })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('ether-packaged-first-launch.png') })
      await page.getByRole('switch', { name: /^Yolo mode/ }).uncheck()
      await page
        .locator('[data-onboarding-overlay] footer')
        .getByRole('button', { name: /^Continue/ })
        .click()
      await expect(page.getByRole('heading', { name: 'Make it feel like home' })).toBeVisible()
      await page.getByRole('button', { name: 'Skip to project setup', exact: true }).click()
      const projectDialog = page.getByRole('dialog', { name: 'New Project', exact: true })
      await expect(projectDialog).toBeVisible()
      await projectDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await expect(
      page.getByRole('button', { name: 'New Project', exact: true }).first()
    ).toBeVisible()
    await expect(page.locator('.titlebar-app-name')).toHaveText('Ether')
    await expect(page.locator('.titlebar-app-name')).toHaveAttribute('aria-label', 'Ether')
    await expect(page).toHaveTitle('Ether')
    expect(await page.evaluate(() => window.api.app.getIdentity())).toMatchObject({
      name: 'Ether',
      isDev: false
    })
    expect(
      await page.evaluate(async () => {
        const settings = await window.api.settings.get()
        // Upstream keeps permissions in agentPermissionDefault; Ether adds no default flags.
        return {
          claude: settings.agentDefaultArgs?.claude ?? '',
          codex: settings.agentDefaultArgs?.codex ?? ''
        }
      })
    ).toEqual({ claude: '', codex: '' })
    expect(new URL(page.url()).protocol).toBe('file:')
    const windows = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        focused: window.isFocused()
      }))
    )
    expect(windows.length).toBeGreaterThan(0)
    expect(windows.every((window) => !window.visible && !window.focused)).toBe(true)
    await testInfo.attach(`package-metadata-${testInfo.attachments.length}.json`, {
      body: JSON.stringify({ ...metadata, windows }, null, 2),
      contentType: 'application/json'
    })
    return { app, page }
  }
  try {
    const first = await launch(true)
    await createProject(first.page, 'Packaged Ether', [appA, appB])
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Saved by packaged Ether')
    await first.page.keyboard.press('ControlOrMeta+S')
    await expect
      .poll(() => readFileSync(path.join(appA, 'README.md'), 'utf8'))
      .toContain('Saved by packaged Ether')
    await openRootReadme(first.page, 'app_b')
    await appendToReadme(first.page, 'Packaged Ether unsaved draft')
    await first.page
      .getByRole('button', { name: 'Terminal in this directory', exact: true })
      .click()
    const terminal = first.page.locator('[data-pty-id]:visible .xterm-helper-textarea').first()
    await terminal.waitFor({ state: 'attached' })
    await terminal.focus()
    await first.page.keyboard.type(
      "printf '%s\\n' ETHER_PACKAGED_TERMINAL_OK > packaged-terminal-marker.txt"
    )
    await first.page.keyboard.press('Enter')
    const markerPath = path.join(appB, 'packaged-terminal-marker.txt')
    await expect
      .poll(() => (existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : ''))
      .toContain('ETHER_PACKAGED_TERMINAL_OK')
    expect(existsSync(path.join(appA, 'packaged-terminal-marker.txt'))).toBe(false)
    await openRootReadme(first.page, 'app_b')
    await expect(first.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Packaged Ether unsaved draft'
    )
    expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b\n')
    await first.page.screenshot({ path: testInfo.outputPath('ether-packaged-before-quit.png') })
    await normalQuit(first.app)
    active.app = null

    const second = await launch()
    await closeFeatureTips(second.page, 3000)
    const project = second.page.getByRole('region', { name: 'Packaged Ether', exact: true })
    await expect(project).toBeVisible()
    await expect(project.locator('[data-worktree-id]').filter({ hasText: 'Main' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Packaged Ether unsaved draft'
    )
    await expect(second.page.locator('.editor-header-path:visible').first()).toContainText('app_b')
    await expect(
      second.page
        .getByRole('group', { name: 'Browse directory' })
        .getByRole('button', { name: 'app_a', exact: true })
    ).toBeVisible()
    await expect(
      second.page
        .getByRole('group', { name: 'Browse directory' })
        .getByRole('button', { name: 'app_b', exact: true })
    ).toBeVisible()
    expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toContain('Saved by packaged Ether')
    expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b\n')
    expect(readFileSync(markerPath, 'utf8')).toContain('ETHER_PACKAGED_TERMINAL_OK')
    for (const upstreamProfile of ['Orca', 'orca', 'orca-dev']) {
      expect(
        existsSync(
          path.join(isolation.isolatedHome, 'Library', 'Application Support', upstreamProfile)
        )
      ).toBe(false)
    }
    await second.page.screenshot({ path: testInfo.outputPath('ether-packaged-restored.png') })
    expect(rendererErrors).toEqual([])
    await normalQuit(second.app)
    active.app = null
  } finally {
    if (active.page && !active.page.isClosed()) {
      await active.page
        .screenshot({ path: testInfo.outputPath('ether-packaged-final.png') })
        .catch(() => undefined)
    }
    if (active.app) {
      await closeElectronAppForE2E(active.app).catch(() => undefined)
    }
    await cleanupE2EDaemons(userDataDir)
    rmSync(fixture, { recursive: true, force: true })
  }
})
