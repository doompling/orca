import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { isPersistedAgentSessionRecord } from '../../src/shared/agent-session-record'
import { decodePersistedAgentSessionRecord } from '../../src/shared/agent-session-record-stored-form'
import { requireLegacyAgentSessionAccountHome } from '../../src/shared/agent-session-account-home'
import { expect, test as base } from './helpers/orca-app'
import { createProject } from './helpers/local-project-controls'
import {
  installLocalProjectScriptedChat,
  SCRIPTED_CHAT_MESSAGE,
  SCRIPTED_CHAT_RESPONSE
} from './helpers/local-project-scripted-chat'

const test = base.extend<{ scriptedChat: ReturnType<typeof installLocalProjectScriptedChat> }>({
  scriptedChat: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ether-fork-chat-cli-')))
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

const RecordRow = z.object({ record_json: z.string() })

function readChatRecords(userDataDir: string) {
  const db = new DatabaseSync(path.join(userDataDir, 'agent-session-journal.db'), {
    readOnly: true
  })
  try {
    return db
      .prepare('SELECT record_json FROM agent_session_records')
      .all()
      .map((row) => {
        const record: unknown = JSON.parse(RecordRow.parse(row).record_json)
        if (!isPersistedAgentSessionRecord(record)) {
          throw new Error('Unreadable chat record')
        }
        return decodePersistedAgentSessionRecord(record).record
      })
  } finally {
    db.close()
  }
}

/** What Claude would have saved for the scripted turn, so the fork has a conversation to copy. */
function seedClaudeTranscript(accountHome: string, sessionId: string, cwd: string): void {
  const project = path.join(accountHome, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(project, { recursive: true })
  const prompt = randomUUID()
  const lines = [
    {
      type: 'user',
      uuid: prompt,
      parentUuid: null,
      message: { role: 'user', content: SCRIPTED_CHAT_MESSAGE }
    },
    {
      type: 'assistant',
      uuid: randomUUID(),
      parentUuid: prompt,
      message: { role: 'assistant', content: [{ type: 'text', text: SCRIPTED_CHAT_RESPONSE }] }
    }
  ].map((entry) =>
    JSON.stringify({
      ...entry,
      sessionId,
      cwd,
      timestamp: new Date().toISOString(),
      isSidechain: false
    })
  )
  writeFileSync(path.join(project, `${sessionId}.jsonl`), `${lines.join('\n')}\n`)
}

test('forks a built-in chat into a new chat with a copy of its conversation and every root', async ({
  orcaPage: page,
  electronApp,
  scriptedChat: fixture,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ether-fork-chat-')))
  registerPostElectronShutdownCleanup(async () => rmSync(scratch, { recursive: true, force: true }))
  const directories = ['app_a', 'app_b'].map((label) => path.join(scratch, label))
  for (const directory of directories) {
    mkdirSync(directory)
  }
  await page.evaluate(async () => {
    await window.__store?.getState().updateSettings({
      experimentalNativeChat: true,
      agentDefaultArgs: { claude: '' },
      nativeChatPermissionMode: 'ask'
    })
  })
  await createProject(page, 'Fork project', directories)
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
  await expect(chat.getByRole('textbox')).toBeEditable({ timeout: 20_000 })
  await chat.getByRole('textbox').fill(SCRIPTED_CHAT_MESSAGE)
  await chat.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })

  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  await expect.poll(() => readChatRecords(userDataDir)[0]?.providerHandleChain.length).toBe(1)
  const [source] = readChatRecords(userDataDir)
  const sourceSession = source.providerHandleChain[0].handle.nativeId
  seedClaudeTranscript(
    requireLegacyAgentSessionAccountHome(source.accountHome).path,
    sourceSession,
    directories[0]
  )

  const chatTabs = page.locator(
    '[data-tab-id^="agent-session:"]:visible, [data-tab-id^="structured-agent-session-"]:visible'
  )
  const tabsBefore = await chatTabs.count()
  await chat.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Fork Chat', exact: true }).click()

  await expect.poll(() => readChatRecords(userDataDir).length, { timeout: 20_000 }).toBe(2)
  const fork = readChatRecords(userDataDir).find(
    (record) => record.providerHandleChain[0]?.handle.nativeId !== sourceSession
  )
  expect(fork?.providerHandleChain[0]?.handle.nativeId).toBeTruthy()
  expect(fork?.localWorkspaceScope?.roots.map((root) => root.path)).toEqual(directories)
  await expect.poll(() => chatTabs.count()).toBe(tabsBefore + 1)
  const forked = page.locator('[data-native-chat-root="true"]:visible')
  await expect(forked.getByText(SCRIPTED_CHAT_RESPONSE, { exact: true }).first()).toBeVisible({
    timeout: 20_000
  })
  await page.screenshot({ path: testInfo.outputPath('forked-chat.png') })
})
