import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
  type TestInfo
} from '@stablyai/playwright-test'
import { randomUUID } from 'node:crypto'
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
import { z } from 'zod'
import { getDefaultSourceControlAiSettings } from '../../../src/shared/source-control-ai-settings'
import { getE2ECompletedOnboardingProfile } from './e2e-completed-onboarding-profile'
import { retryTransientMainEvaluate } from './electron-main-evaluate-retry'
import { cleanupE2EDaemons, closeElectronAppForE2E } from './electron-process-shutdown'
import { createProject } from './local-project-controls'
import { defaultEtherReleaseBundle } from './ether-release-bundle'

type ChatSmoke = { agent: 'codex'; model: string; testInfo: TestInfo }

const sessionOptions = z.object({
  models: z.array(z.object({ id: z.string(), label: z.string() })),
  current: z.object({
    model: z.string(),
    effort: z.string().optional(),
    fastMode: z.boolean().optional()
  })
})

async function assertReadyChat(page: Page, { agent, model }: ChatSmoke): Promise<string> {
  const chat = page.locator('[data-native-chat-root="true"]:visible')
  await expect(chat).toBeVisible({ timeout: 30_000 })
  await expect(chat.getByRole('textbox')).toBeEditable()
  await expect(chat.getByRole('button', { name: /^Model / })).toBeVisible({ timeout: 30_000 })
  const tabId = await page
    .locator(`[data-tab-id^="structured-agent-session-${agent}_"][data-active="true"]:visible`)
    .getAttribute('data-tab-id')
  if (!tabId) {
    throw new Error('The visible chat has no structured session tab')
  }
  const readOptions = async () => {
    const response = await page.evaluate(
      (sessionId) =>
        window.api.runtime.call({
          method: 'agentSession.options',
          params: { sessionId }
        }),
      tabId.slice('structured-agent-session-'.length)
    )
    return response
  }
  await expect.poll(readOptions, { timeout: 30_000 }).toMatchObject({
    ok: true,
    result: { current: { model, effort: 'low', fastMode: false } }
  })
  const response = await readOptions()
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const choice = sessionOptions.parse(response.result).models.find((entry) => entry.id === model)
  if (!choice) {
    throw new Error('The explicitly requested test model is not in the signed-in model catalog')
  }
  await expect(
    chat.getByRole('button', { name: `Model ${choice.label}`, exact: true })
  ).toBeVisible()
  await expect(chat.getByRole('button', { name: 'Effort Low', exact: true })).toBeVisible()
  await expect(
    chat.getByText(/Chat connection could not be confirmed\.|Chat could not be started\./)
  ).toHaveCount(0)
  return tabId
}

async function normalQuit(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await closeElectronAppForE2E(app)
  expect(child.signalCode, 'Normal Quit must not need forced termination').toBeNull()
  expect(child.exitCode).toBe(0)
}

export async function runPackagedAgentChatSmoke(input: ChatSmoke): Promise<void> {
  const { agent, model, testInfo } = input
  const label = 'Codex'
  test.setTimeout(180_000)
  test.skip(
    process.platform !== 'darwin' || process.arch !== 'arm64',
    'Requires the Apple Silicon Ether package'
  )
  const bundle = process.env.ETHER_E2E_APP ?? defaultEtherReleaseBundle()
  expect(bundle.trim(), 'ETHER_E2E_APP must name a bundle').not.toBe('')
  const executablePath = path.join(path.resolve(bundle), 'Contents', 'MacOS', 'Ether')
  expect(existsSync(executablePath), 'Build Ether before opting into the live smoke').toBe(true)
  const fixture = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), `ether-${agent}-chat-`)))
  const userDataDir = path.join(fixture, 'profile')
  const directories = ['app_a', 'app_b'].map((name) => path.join(fixture, name))
  const markers = directories.map((directory) => `${path.basename(directory)}_${randomUUID()}`)
  mkdirSync(userDataDir)
  for (const [index, directory] of directories.entries()) {
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'README.md'), `${markers[index]}\n`)
  }
  const seed = getE2ECompletedOnboardingProfile()
  writeFileSync(
    path.join(userDataDir, 'orca-data.json'),
    JSON.stringify({
      ...seed,
      settings: {
        ...seed.settings,
        experimentalNativeChat: true,
        experimentalStructuredNativeChat: true,
        openAgentTabsInChatByDefault: true,
        agentDefaultArgs: { [agent]: '' },
        agentYoloDefaultsMigrated: true,
        agentStatusHooksEnabled: false,
        autoRenameBranchFromWork: false,
        autoRenameBranchFromWorkDefaultedOn: true,
        tabAutoGenerateTitle: false,
        sourceControlAi: { ...getDefaultSourceControlAiSettings(), enabled: false },
        nativeChatSessionOptions: {
          [agent]: {
            model,
            valuesByModel: { [model]: { effort: 'low', fastMode: false } }
          }
        }
      }
    })
  )
  const excluded = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_RENDERER_URL',
    'VITE_DEV_SERVER_URL',
    'ORCA_DEV_USER_DATA_PATH',
    'ORCA_USER_DATA_PATH',
    'ORCA_E2E_USER_DATA_DIR',
    'ORCA_E2E_HOME_DIR',
    'ORCA_E2E_HEADFUL',
    'ORCA_E2E_FOREGROUND',
    'ORCA_E2E_TERMINAL_PERF_XVFB',
    'ORCA_RELAY_PATH'
  ])
  // Real HOME intentionally supplies the approved CLI sign-in; Ether data stays disposable.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !excluded.has(key))),
    NODE_ENV: 'production',
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_E2E_HEADLESS: '1',
    ORCA_DEV_USER_DATA_PATH: userDataDir,
    ORCA_E2E_ENFORCE_SINGLE_INSTANCE_LOCK: '1'
  }
  const active: { app: ElectronApplication | null; page: Page | null } = { app: null, page: null }
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
      env
    })
    active.app = app
    const page = await app.firstWindow({ timeout: 60_000 })
    active.page = page
    await expect(
      page.getByRole('button', { name: 'New Project', exact: true }).first()
    ).toBeVisible()
    const metadata = await retryTransientMainEvaluate(() =>
      app.evaluate(({ app, BrowserWindow }) => ({
        packaged: app.isPackaged,
        name: app.getName(),
        userData: app.getPath('userData'),
        home: app.getPath('home'),
        cwd: process.cwd(),
        windows: BrowserWindow.getAllWindows().map((window) => ({
          visible: window.isVisible(),
          focused: window.isFocused()
        }))
      }))
    )
    expect(metadata).toMatchObject({
      packaged: true,
      name: 'Ether',
      userData: userDataDir,
      home: os.homedir(),
      cwd: fixture
    })
    expect(metadata.windows.length).toBeGreaterThan(0)
    expect(metadata.windows.every((window) => !window.visible && !window.focused)).toBe(true)
    return { app, page }
  }
  try {
    const first = await launch()
    await createProject(first.page, `${label} native smoke`, directories)
    await first.page.getByRole('button', { name: 'New tab', exact: true }).last().click()
    await first.page.getByRole('menuitem', { name: new RegExp(`^${label}(?:\\s|$)`) }).click()
    const tabId = await assertReadyChat(first.page, input)
    const chat = first.page.locator('[data-native-chat-root="true"]:visible')
    await chat.screenshot({ path: testInfo.outputPath(`${agent}-ready-before-request.png`) })
    const prompt = [
      'Read only these two README files, each of which contains one marker:',
      ...directories.map((directory) => JSON.stringify(path.join(directory, 'README.md'))),
      'Do not edit any files, browse, or access anything else. Use only the read-only file access needed for those two files.',
      `Reply with exactly one line: ETHER_${agent.toUpperCase()}_CHAT_OK followed by the app_a marker and the app_b marker, separated by spaces.`
    ].join('\n')
    await chat.getByRole('textbox').fill(prompt)
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    const expectedReply = `ETHER_${agent.toUpperCase()}_CHAT_OK ${markers.join(' ')}`
    await expect(chat.getByText(expectedReply, { exact: true })).toBeVisible({ timeout: 90_000 })
    await expect(chat).toHaveAttribute('data-native-chat-working', 'false')
    await chat.screenshot({ path: testInfo.outputPath(`${agent}-two-root-response.png`) })
    await normalQuit(first.app)
    active.app = null
    const second = await launch()
    await expect(
      second.page.getByRole('region', { name: `${label} native smoke`, exact: true })
    ).toBeVisible()
    expect(await assertReadyChat(second.page, input)).toBe(tabId)
    const restored = second.page.locator('[data-native-chat-root="true"]:visible')
    await expect(restored.getByText(expectedReply, { exact: true })).toBeVisible()
    await restored.screenshot({ path: testInfo.outputPath(`${agent}-conversation-restored.png`) })
    for (const [index, directory] of directories.entries()) {
      expect(readFileSync(path.join(directory, 'README.md'), 'utf8')).toBe(`${markers[index]}\n`)
    }
    await normalQuit(second.app)
    active.app = null
  } catch (error) {
    const trace = path.join(userDataDir, 'logs', 'main.trace.ndjson')
    if (existsSync(trace)) {
      await testInfo.attach('fixture-main-trace', {
        body: readFileSync(trace).subarray(-256 * 1024),
        contentType: 'text/plain'
      })
    }
    throw error
  } finally {
    if (active.page && !active.page.isClosed()) {
      await active.page
        .locator('[data-native-chat-root="true"]:visible')
        .screenshot({
          path: testInfo.outputPath(`${agent}-final-chat.png`),
          timeout: 2000
        })
        .catch(() => undefined)
    }
    if (active.app) {
      await closeElectronAppForE2E(active.app).catch(() => undefined)
    }
    await cleanupE2EDaemons(userDataDir)
    rmSync(fixture, { recursive: true, force: true })
  }
}
