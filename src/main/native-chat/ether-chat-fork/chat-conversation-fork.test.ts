import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import {
  claudeProviderHandle,
  codexProviderHandle
} from '../../../shared/agent-session-provider-handle-encoding'
import { CLAUDE_CLI_CONVERSATIONS } from '../../claude/claude-cli-conversations'
import { resolveStructuredAgentSessionAdoptionForCreate } from '../../runtime/structured-agent-session-create-adoption'
import { forkChatConversation } from './chat-conversation-fork'

let root: string
let home: string
let project: string
let source: string
let original: string

function record(provider: 'claude' | 'codex', overrides: Partial<AgentSessionRecord> = {}) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fork reads only these record fields.
  return {
    sessionId: `${provider}_chat`,
    provider,
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'folder:w',
      workspaceKind: 'folder'
    },
    accountHome: {
      variable: provider === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME',
      path: home
    },
    providerHandleChain: [
      {
        linkId: 'head',
        origin: 'minted',
        mintedAtFence: 1,
        observedAt: 1,
        handle:
          provider === 'claude'
            ? claudeProviderHandle(source, 'leaf')
            : codexProviderHandle('thread-1')
      }
    ],
    ...overrides
  } as AgentSessionRecord
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'ether-chat-fork-')))
  home = join(root, 'account')
  project = join(home, 'projects', 'workspace')
  await mkdir(project, { recursive: true })
  source = randomUUID()
  const prompt = randomUUID()
  const answer = randomUUID()
  original = `${[
    { type: 'user', uuid: prompt, parentUuid: null, message: { role: 'user', content: 'ALPHA' } },
    {
      type: 'assistant',
      uuid: answer,
      parentUuid: prompt,
      message: { role: 'assistant', content: [{ type: 'text', text: 'BRAVO' }] }
    }
  ]
    .map((entry) =>
      JSON.stringify({
        ...entry,
        sessionId: source,
        timestamp: '2026-10-24T00:00:00.000Z',
        isSidechain: false
      })
    )
    .join('\n')}\n`
  await writeFile(join(project, `${source}.jsonl`), original)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('forking a chat conversation', () => {
  it('copies the whole Claude conversation into a new session beside it, leaving the original', async () => {
    const fork = await forkChatConversation('claude_chat', { getRecord: () => record('claude') })
    expect(fork.agent).toBe('claude')
    expect(fork.providerSessionId).not.toBe(source)
    const copy = await readFile(join(project, `${fork.providerSessionId}.jsonl`), 'utf8')
    expect(copy).toContain('ALPHA')
    expect(copy).toContain('BRAVO')
    expect(await readFile(join(project, `${source}.jsonl`), 'utf8')).toBe(original)
    expect((await readdir(project)).sort()).toEqual(
      [`${source}.jsonl`, `${fork.providerSessionId}.jsonl`].sort()
    )
    // The new chat's create finds the copy by id alone, as for any adopted conversation.
    const transcriptImport = CLAUDE_CLI_CONVERSATIONS.transcriptImport
    if (!transcriptImport) {
      throw new Error('Claude registers a transcript importer')
    }
    const adoption = await resolveStructuredAgentSessionAdoptionForCreate({
      settings: {},
      agent: 'claude',
      transcriptImport,
      providerSessionId: fork.providerSessionId,
      selectedAccountHome: { variable: 'CLAUDE_CONFIG_DIR', path: home },
      launchEnv: {},
      workspaceCwd: project
    })
    expect(adoption.transcriptPath).toBe(join(project, `${fork.providerSessionId}.jsonl`))
  })

  it('forks a Codex thread through its own account home', async () => {
    const request = vi.fn(async () => ({ thread: { id: 'thread-copy' } }))
    const runCodexSession = vi.fn(async (_invocation, body) => body({ request }))
    const fork = await forkChatConversation('codex_chat', {
      getRecord: () => record('codex'),
      runCodexSession
    })
    expect(fork).toEqual({ agent: 'codex', providerSessionId: 'thread-copy' })
    expect(request).toHaveBeenCalledWith('thread/fork', { threadId: 'thread-1' })
    expect(runCodexSession.mock.calls[0][0]).toMatchObject({ env: { CODEX_HOME: home } })
  })

  it('refuses a chat with no conversation yet, or one on another host', async () => {
    await expect(
      forkChatConversation('claude_chat', {
        getRecord: () => record('claude', { providerHandleChain: [] })
      })
    ).rejects.toThrow('Send a message first')
    await expect(
      forkChatConversation('claude_chat', {
        getRecord: () =>
          record('claude', {
            location: {
              executionHostId: 'ssh:box',
              wslDistro: null,
              workspaceId: 'w',
              workspaceKind: 'folder'
            }
          })
      })
    ).rejects.toThrow('not available to copy')
  })
})
