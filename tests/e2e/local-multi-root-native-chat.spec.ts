import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test as base } from './helpers/orca-app'
import { createProject } from './helpers/local-project-controls'
import {
  installLocalProjectScriptedChat,
  normalizeScriptedChatArguments,
  readLocalProjectScriptedChatReport,
  SCRIPTED_CHAT_MESSAGE,
  SCRIPTED_CHAT_RESPONSE
} from './helpers/local-project-scripted-chat'

const test = base.extend<{ scriptedChat: ReturnType<typeof installLocalProjectScriptedChat> }>({
  scriptedChat: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-scripted-chat-cli-')))
    registerPostElectronShutdownCleanup(async () =>
      rmSync(directory, { recursive: true, force: true })
    )
    await provideFixture(installLocalProjectScriptedChat(directory))
  },
  launchEnv: async ({ scriptedChat }, provideFixture) => {
    await provideFixture({
      PATH: `${scriptedChat.directory}${path.delimiter}${process.env.PATH ?? ''}`,
      ORCA_SDK_CONTRACT_SCENARIO_PATH: scriptedChat.scenarioPath,
      ORCA_SDK_CONTRACT_REPORT_PATH: scriptedChat.reportPath
    })
  }
})

test.use({ seedTestRepo: false })
test.skip(process.platform === 'win32', 'The scripted CLI launcher is POSIX-only')

test('normal built-in Claude chat carries both local roots through the real SDK to a scripted child', async ({
  orcaPage: page,
  electronApp,
  scriptedChat: fixture,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-local-scripted-chat-')))
  registerPostElectronShutdownCleanup(async () => rmSync(scratch, { recursive: true, force: true }))
  const directories = ['app_a', 'app_b'].map((label) => path.join(scratch, label))
  for (const directory of directories) {
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'marker.txt'), `${path.basename(directory)}\n`)
  }
  await page.evaluate(async () => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('Orca store is unavailable')
    }
    await state.updateSettings({
      experimentalNativeChat: true,
      agentDefaultArgs: { claude: '' },
      // Manual permissions; a fresh profile otherwise starts chats with Full access.
      nativeChatPermissionMode: 'ask'
    })
  })
  await createProject(page, 'Scripted chat project', directories)
  const workspaceKey = await page
    .getByRole('region', { name: 'Scripted chat project', exact: true })
    .locator('[data-worktree-id]')
    .filter({ hasText: /^Main/ })
    .getAttribute('data-worktree-id')
  expect(workspaceKey).toMatch(/^folder:/)

  // Structured chat resolves its own CLI; a terminal command override would force the TUI route.
  await electronApp.evaluate(
    (_electron, input) => {
      process.env.PATH = `${input.directory}${input.delimiter}${process.env.PATH ?? ''}`
      process.env.ORCA_SDK_CONTRACT_SCENARIO_PATH = input.scenarioPath
      process.env.ORCA_SDK_CONTRACT_REPORT_PATH = input.reportPath
    },
    { ...fixture, delimiter: path.delimiter }
  )
  await page.getByRole('button', { name: 'New tab', exact: true }).last().click()
  await page.getByRole('menuitem', { name: 'Start a chat with Claude', exact: true }).click()
  const chat = page.locator('[data-native-chat-root="true"]:visible')
  await expect(chat).toBeVisible({ timeout: 20_000 })
  const composer = chat.getByRole('textbox')
  await expect(composer).toBeEditable({ timeout: 20_000 })
  await composer.fill(SCRIPTED_CHAT_MESSAGE)
  await chat.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })

  await expect
    .poll(() => readLocalProjectScriptedChatReport(fixture.reportPath)?.userMessages.length)
    .toBe(1)
  const report = readLocalProjectScriptedChatReport(fixture.reportPath)
  if (!report || !workspaceKey) {
    throw new Error('The scripted CLI did not retain its launch and actual composer input')
  }
  expect(report.argv[0]).toBe(fixture.scriptPath)
  expect(report.cwd).toBe(directories[0])
  expect(report.execPath).toBe(process.execPath)
  expect(JSON.stringify(report.userMessages[0]?.message.content)).toContain(SCRIPTED_CHAT_MESSAGE)
  const argv = normalizeScriptedChatArguments(report.argv)
  const addedDirectories = argv.flatMap((arg, index) =>
    arg === '--add-dir' ? [argv[index + 1]] : []
  )
  // Upstream also grants its own attachment and scratch folders; every Workspace root must be there.
  expect(addedDirectories).toEqual(expect.arrayContaining(directories))
  expect(argv).not.toContain('--dangerously-skip-permissions')
  const initialize = report.controlRequests.find((frame) => frame.request.subtype === 'initialize')
  const appendSystemPrompt = initialize?.request.appendSystemPrompt
  const context = Array.isArray(appendSystemPrompt)
    ? appendSystemPrompt.join('\n')
    : appendSystemPrompt
  expect(context).toContain(
    `"workspaceId": ${JSON.stringify(workspaceKey.slice('folder:'.length))}`
  )
  for (const directory of directories) {
    expect(context).toContain(`"path": ${JSON.stringify(directory)}`)
    expect(context).toContain(`"label": ${JSON.stringify(path.basename(directory))}`)
  }
  expect(initialize).toBeDefined()
  await testInfo.attach('scripted-cli-report.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  })
  await page.screenshot({ path: testInfo.outputPath('multi-root-scripted-chat.png') })
})
