import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { DatabaseSync } from 'node:sqlite'
import { isPersistedAgentSessionRecord } from '../../src/shared/agent-session-record'
import { decodePersistedAgentSessionRecord } from '../../src/shared/agent-session-record-stored-form'
import { agentSessionProviderHandleRoot } from '../../src/shared/agent-session-provider-handle'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'
import { quoteStartupArg } from '../../src/shared/tui-agent-startup-shell'
import { test, expect } from './helpers/orca-app'
import { createRestartSession } from './helpers/orca-restart'
import {
  processIdentityIsAlive,
  processIdentityLiveness,
  recordProcessIdentity,
  recordProcessTree,
  terminateRecordedTree,
  type RecordedProcessIdentity
} from './helpers/daemon-generation-processes'
import {
  appendToReadme,
  createProject,
  createWorkspace,
  openRootReadme
} from './helpers/local-project-controls'
import {
  installLocalProjectScriptedChat,
  readLocalWorkspaceChatRoots,
  readLocalProjectScriptedChatReport,
  SCRIPTED_CHAT_MESSAGE,
  SCRIPTED_CHAT_RESPONSE
} from './helpers/local-project-scripted-chat'
import { waitForSessionReady } from './helpers/store'
import { waitForRestoredTerminalInputReady } from './helpers/restored-terminal-input-readiness'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

const VISIBLE_TABS = '[data-tab-id][data-active]:visible'
const daemonPidSchema = z.object({ pid: z.number().int().positive() })
const recordRowSchema = z.object({ record_json: z.string() })

test.skip(process.platform === 'win32', 'This local cold-runtime journey uses POSIX fixture CLIs')

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

function createRoots(fixture: string): string[] {
  return ['app_a', 'app_b'].map((label) => {
    const directory = path.join(fixture, label)
    mkdirSync(directory)
    writeFileSync(path.join(directory, 'README.md'), `# ${label} cold restart marker\n`)
    return directory
  })
}

async function captureFixtureProcesses(
  app: ElectronApplication,
  userDataDir: string
): Promise<RecordedProcessIdentity[]> {
  const appPid = app.process().pid
  if (!appPid) {
    throw new Error('The fixture Electron process has no PID')
  }
  const daemonFile = path.join(userDataDir, 'daemon', `daemon-v${PROTOCOL_VERSION}.pid`)
  const daemon = daemonPidSchema.parse(JSON.parse(readFileSync(daemonFile, 'utf8')))
  const trees = await Promise.all(
    [appPid, daemon.pid].map(async (pid) => recordProcessTree(await recordProcessIdentity(pid)))
  )
  return [...new Map(trees.flat().map((identity) => [identity.pid, identity])).values()]
}

async function proveColdRuntime(
  identities: RecordedProcessIdentity[],
  testInfo: TestInfo
): Promise<void> {
  await terminateRecordedTree(identities)
  const liveness = await processIdentityLiveness(identities)
  expect(
    [...liveness.values()],
    'Every original fixture process must be absent before relaunch'
  ).not.toContain(true)
  await testInfo.attach('original-runtime-absent.json', {
    body: JSON.stringify(
      identities.map((identity) => ({ ...identity, alive: liveness.get(identity.pid) })),
      null,
      2
    ),
    contentType: 'application/json'
  })
}

/** The chat's record, read from the host journal database the app commits it to. */
function readNativeRecord(userDataDir: string, sessionId: string) {
  const db = new DatabaseSync(path.join(userDataDir, 'agent-session-journal.db'), {
    readOnly: true
  })
  try {
    const row = recordRowSchema.parse(
      db
        .prepare('SELECT record_json FROM agent_session_records WHERE session_id = ?')
        .get(sessionId)
    )
    const record: unknown = JSON.parse(row.record_json)
    if (!isPersistedAgentSessionRecord(record)) {
      throw new Error('Missing valid fixture native session record')
    }
    return decodePersistedAgentSessionRecord(record).record
  } finally {
    db.close()
  }
}

async function pointAtScriptedChat(
  app: ElectronApplication,
  fixture: ReturnType<typeof installLocalProjectScriptedChat>
): Promise<void> {
  await app.evaluate(
    (_electron, input) => {
      process.env.PATH = `${input.directory}${input.delimiter}${process.env.PATH ?? ''}`
      process.env.ORCA_SDK_CONTRACT_SCENARIO_PATH = input.scenarioPath
      process.env.ORCA_SDK_CONTRACT_REPORT_PATH = input.reportPath
    },
    { ...fixture, delimiter: path.delimiter }
  )
}

test('cold runtime restores overlapping contexts and drafts without claiming the old shells survived', async (// oxlint-disable-next-line no-empty-pattern -- This test owns both isolated Electron launches.
{}, testInfo) => {
  const fixture = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ether-cold-contexts-')))
  const [appA, appB] = createRoots(fixture)
  const session = createRestartSession(testInfo)
  let runningApp: ElectronApplication | null = null
  let originalProcesses: RecordedProcessIdentity[] = []
  try {
    const first = await session.launch()
    runningApp = first.app
    await waitForSessionReady(first.page)
    await createProject(first.page, 'Full application', [appA, appB])
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Main cold draft')
    await first.page
      .getByRole('button', { name: 'Terminal in this directory', exact: true })
      .click()
    await waitForActiveTerminalManager(first.page)
    await waitForActivePanePtyId(first.page)
    const terminalTabId = await first.page
      .locator(`${VISIBLE_TABS}[data-active="true"]`)
      .getAttribute('data-tab-id')
    expect(terminalTabId).toBeTruthy()
    await focusActiveTerminalInput(first.page)
    await first.page.keyboard.type('echo ETHER_BEFORE_COLD_RUNTIME')
    await first.page.keyboard.press('Enter')
    await expect.poll(() => getTerminalContent(first.page)).toContain('ETHER_BEFORE_COLD_RUNTIME')
    const mainTabs = await visibleTabIds(first.page)
    await createWorkspace(first.page, 'Full application', 'Investigate')
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Investigate cold draft')
    const investigateTabs = await visibleTabIds(first.page)
    await createProject(first.page, 'App A maintenance', [appA])
    await openRootReadme(first.page, 'app_a')
    await appendToReadme(first.page, 'Maintenance cold draft')
    const maintenanceTabs = await visibleTabIds(first.page)
    originalProcesses = await captureFixtureProcesses(first.app, session.userDataDir)
    const firstProcess = first.app.process()
    await session.close(first.app)
    runningApp = null
    expect(
      firstProcess.signalCode,
      'Normal Quit must checkpoint without a forced app kill'
    ).toBeNull()
    expect(firstProcess.exitCode).toBe(0)
    await proveColdRuntime(originalProcesses, testInfo)

    const second = await session.launch()
    runningApp = second.app
    await waitForSessionReady(second.page)
    await expect(workspaceRow(second.page, 'App A maintenance', 'Main')).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Maintenance cold draft'
    )
    expect(await visibleTabIds(second.page)).toEqual(maintenanceTabs)
    await workspaceRow(second.page, 'Full application', 'Investigate').click()
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Investigate cold draft'
    )
    expect(await visibleTabIds(second.page)).toEqual(investigateTabs)
    await workspaceRow(second.page, 'Full application', 'Main').click()
    await expect.poll(() => visibleTabIds(second.page)).toEqual(mainTabs)
    await second.page.locator(`${VISIBLE_TABS}[data-tab-id="${terminalTabId}"]`).click()
    await waitForActiveTerminalManager(second.page)
    const restoredPtyId = await waitForActivePanePtyId(second.page)
    expect(await waitForRestoredTerminalInputReady(second.page, restoredPtyId)).toBe(true)
    await focusActiveTerminalInput(second.page)
    await second.page.keyboard.type('printf "ETHER_AFTER_COLD_RUNTIME:%s\\n" "$PWD"')
    await second.page.keyboard.press('Enter')
    await expect
      .poll(() => getTerminalContent(second.page))
      .toContain(`ETHER_AFTER_COLD_RUNTIME:${appA}`)
    await openRootReadme(second.page, 'app_a')
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Main cold draft'
    )
    // Both Workspaces opened the same file, so they share its one restored draft.
    await expect(second.page.locator('.rich-markdown-editor:visible')).toContainText(
      'Maintenance cold draft'
    )
    expect(readFileSync(path.join(appA, 'README.md'), 'utf8')).toBe('# app_a cold restart marker\n')
    expect(readFileSync(path.join(appB, 'README.md'), 'utf8')).toBe('# app_b cold restart marker\n')
    await second.page.screenshot({ path: testInfo.outputPath('cold-restored-contexts.png') })
  } finally {
    if (runningApp) {
      await session.close(runningApp)
    }
    await terminateRecordedTree(originalProcesses)
    await session.dispose()
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('cold native chat keeps its history and frozen roots, then continues in a new provider process', async (// oxlint-disable-next-line no-empty-pattern -- This test owns both isolated Electron launches.
{}, testInfo) => {
  const fixture = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ether-cold-chat-')))
  const directories = createRoots(fixture)
  const cliDirectory = path.join(fixture, 'cli')
  mkdirSync(cliDirectory)
  const scriptedChat = installLocalProjectScriptedChat(cliDirectory)
  const session = createRestartSession(testInfo, {
    SHELL: '/bin/bash',
    PATH: `${cliDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
    ORCA_SDK_CONTRACT_SCENARIO_PATH: scriptedChat.scenarioPath,
    ORCA_SDK_CONTRACT_REPORT_PATH: scriptedChat.reportPath
  })
  writeFileSync(
    path.join(session.userDataDir, 'home', '.bash_profile'),
    `export PATH=${quoteStartupArg(cliDirectory, 'posix')}:"$PATH"\n`
  )
  let runningApp: ElectronApplication | null = null
  let originalProcesses: RecordedProcessIdentity[] = []
  try {
    const first = await session.launch()
    runningApp = first.app
    await waitForSessionReady(first.page)
    await first.page.evaluate(async () => {
      await window.__store?.getState().updateSettings({
        experimentalNativeChat: true,
        agentDefaultArgs: { claude: '' }
      })
    })
    await createProject(first.page, 'Cold chat project', directories)
    await pointAtScriptedChat(first.app, scriptedChat)
    await first.page.getByRole('button', { name: 'New tab', exact: true }).last().click()
    await first.page
      .getByRole('menuitem', { name: 'Start a chat with Claude', exact: true })
      .click()
    const chat = first.page.locator('[data-native-chat-root="true"]:visible')
    await expect(chat.getByRole('textbox')).toBeEditable({ timeout: 20_000 })
    await chat.getByRole('textbox').fill(SCRIPTED_CHAT_MESSAGE)
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(chat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()).toBeVisible({
      timeout: 20_000
    })
    const tabId = await first.page
      .locator(`${VISIBLE_TABS}[data-active="true"]`)
      .getAttribute('data-tab-id')
    if (!tabId?.startsWith('structured-agent-session-')) {
      throw new Error('Missing native chat tab identity')
    }
    const sessionId = tabId.slice('structured-agent-session-'.length)
    const before = readNativeRecord(session.userDataDir, sessionId)
    const frozenRoots = readLocalWorkspaceChatRoots(session.userDataDir, sessionId)
    expect(frozenRoots?.roots.map((root) => root.path)).toEqual(directories)
    if (!before.lease.ownerProcess) {
      throw new Error('The scripted native child did not acquire a process identity')
    }
    const nativeProcess = await recordProcessIdentity(before.lease.ownerProcess.pid)
    originalProcesses = await captureFixtureProcesses(first.app, session.userDataDir)
    expect(originalProcesses).toContainEqual(nativeProcess)
    const firstProcess = first.app.process()
    await session.close(first.app)
    runningApp = null
    expect(firstProcess.signalCode).toBeNull()
    expect(firstProcess.exitCode).toBe(0)
    await proveColdRuntime(originalProcesses, testInfo)
    const secondResponse =
      'Scripted cold continuation: a new child used the saved session and roots.'
    installLocalProjectScriptedChat(cliDirectory, secondResponse)

    const second = await session.launch()
    runningApp = second.app
    await pointAtScriptedChat(second.app, scriptedChat)
    await waitForSessionReady(second.page)
    await second.page.locator(`${VISIBLE_TABS}[data-tab-id="${tabId}"]`).click()
    const restoredChat = second.page.locator('[data-native-chat-root="true"]:visible')
    await expect(
      restoredChat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 })
    await expect(restoredChat.getByRole('textbox')).toBeEditable({ timeout: 20_000 })
    await restoredChat
      .getByRole('textbox')
      .fill('Continue the saved fixture conversation after cold runtime loss.')
    await restoredChat.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(restoredChat.getByText(secondResponse, { exact: true }).first()).toBeVisible({
      timeout: 20_000
    })
    const after = readNativeRecord(session.userDataDir, sessionId)
    expect(readLocalWorkspaceChatRoots(session.userDataDir, sessionId)).toEqual(frozenRoots)
    expect(after.location).toEqual(before.location)
    const beforeHandle = before.providerHandleChain.at(-1)?.handle
    const afterHandle = after.providerHandleChain.at(-1)?.handle
    if (!beforeHandle || !afterHandle) {
      throw new Error('Missing provider conversation identity across cold restore')
    }
    expect(agentSessionProviderHandleRoot(afterHandle)).toBe(
      agentSessionProviderHandleRoot(beforeHandle)
    )
    if (!after.lease.ownerProcess) {
      throw new Error('The cold continuation has no new provider process')
    }
    const replacement = await recordProcessIdentity(after.lease.ownerProcess.pid)
    expect(replacement).not.toEqual(nativeProcess)
    expect(await processIdentityIsAlive(nativeProcess)).toBe(false)
    const report = readLocalProjectScriptedChatReport(scriptedChat.reportPath)
    expect(report?.argv[0]).toBe(scriptedChat.scriptPath)
    expect(report?.cwd).toBe(directories[0])
    expect(JSON.stringify(report?.userMessages)).toContain(
      'Continue the saved fixture conversation after cold runtime loss.'
    )
    await testInfo.attach('native-cold-process-replacement.json', {
      body: JSON.stringify(
        { sessionId, before: nativeProcess, after: replacement, scope: frozenRoots },
        null,
        2
      ),
      contentType: 'application/json'
    })
    await second.page.screenshot({ path: testInfo.outputPath('cold-restored-native-chat.png') })
  } finally {
    if (runningApp) {
      await session.close(runningApp)
    }
    await terminateRecordedTree(originalProcesses)
    await session.dispose()
    rmSync(fixture, { recursive: true, force: true })
  }
})
