import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import type { AgentSessionProviderHandleLink } from '../../shared/agent-session-provider-handle'
import {
  claudeProviderHandle,
  codexProviderHandle
} from '../../shared/agent-session-provider-handle-encoding'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { codexStructuredPermissionPolicy } from '../../shared/codex-permission-policy'
import {
  rememberSessionScope,
  sessionScopeFor,
  setSessionScopeFileForTests
} from '../local-projects/session-scope-store'
import { closeTestJournalHostDatabases } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import type { AgentSessionRecordStore } from './agent-session-record-store'
import { openTestAgentSessionRecordStore } from './agent-session-record-store-test-harness'
import type { AgentSessionReserveRequest } from './agent-session/ownership/agent-session-reservation-admission'
import {
  createClaudeStructuredLaunchResolver,
  createCodexStructuredLaunchResolver
} from './structured-agent-launch-composition.test-support'

const NOW = 1_800_000_000_000
let directory: string
let nextOperation: number
let store: AgentSessionRecordStore

function frozenScope() {
  return captureLocalWorkspaceLaunchScope({
    workspaceId: 'workspace-a',
    projectId: 'project',
    defaultRootId: 'b',
    roots: [
      { id: 'a', label: 'App A', path: join(directory, 'app-a') },
      { id: 'b', label: 'App B', path: join(directory, 'app-b') }
    ]
  })
}

const location = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'folder:workspace-a',
  workspaceKind: 'folder'
} as const

function request(
  provider: 'codex' | 'claude' = 'codex',
  overrides: Partial<AgentSessionReserveRequest> = {}
): AgentSessionReserveRequest {
  nextOperation += 1
  return {
    sessionId: `session-${provider}`,
    provider,
    location,
    accountHome: {
      variable: provider === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR',
      path: join(directory, 'account')
    },
    expectedFence: null,
    spawnToken: 'test-spawn',
    claimKeyId: 'test-key',
    handoffOperationId: null,
    probe: { outcome: 'reservation-unused' },
    operation: {
      callerKey: 'test-client',
      operationId: `${NOW}-${String(nextOperation).padStart(32, '0')}`,
      fingerprint: `scope-${nextOperation}`
    },
    now: NOW,
    ...overrides
  }
}

function resumedLink(provider: 'codex' | 'claude'): AgentSessionProviderHandleLink {
  return {
    linkId: 'original-handle',
    origin: 'adopted',
    mintedAtFence: 1,
    observedAt: NOW,
    handle:
      provider === 'codex'
        ? codexProviderHandle('original-thread')
        : claudeProviderHandle('original-session', 'original-leaf')
  }
}

/** A record as the store keeps it, read back for a launch, with its roots frozen. */
function scopedRecord(provider: 'codex' | 'claude', resuming: boolean): AgentSessionRecord {
  rememberSessionScope({ sessionId: `session-${provider}`, location }, frozenScope(), true)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: launch resolution reads only these record fields.
  return {
    sessionId: `session-${provider}`,
    provider,
    location,
    accountHome: {
      variable: provider === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR',
      path: join(directory, 'account')
    },
    providerHandleChain: resuming ? [resumedLink(provider)] : []
  } as AgentSessionRecord
}

type LaunchIdentity = Parameters<
  ReturnType<typeof createCodexStructuredLaunchResolver>
>[0]['identity']

function identityFor(record: AgentSessionRecord): LaunchIdentity {
  const head = record.providerHandleChain[0]?.handle
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: launch resolution reads only the session id and the resumed handle.
  return {
    sessionId: record.sessionId,
    ...(head ? { providerHandle: head } : {})
  } as LaunchIdentity
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-chat-record-roots-'))
  nextOperation = 0
  await Promise.all(frozenScope().roots.map((root) => mkdir(root.path)))
  store = await openTestAgentSessionRecordStore(join(directory, 'state'), { hostId: 'local' })
  setSessionScopeFileForTests(join(directory, 'scopes.json'))
})

afterEach(async () => {
  setSessionScopeFileForTests(undefined)
  closeTestJournalHostDatabases()
  await rm(directory, { recursive: true, force: true })
})

describe('multi-root chat frozen roots', () => {
  const session = { sessionId: 'session-codex', location }

  it('copies the first roots into the scope store and restores them after reopen', async () => {
    const original = frozenScope()
    rememberSessionScope(session, original, true)
    original.roots[0].path = join(directory, 'changed-after-launch')
    expect(sessionScopeFor(session)).toEqual(frozenScope())
    setSessionScopeFileForTests(join(directory, 'scopes.json'))
    expect(sessionScopeFor(session)).toEqual(frozenScope())
  })

  it('refuses rebinding a recorded session to a changed checkout', () => {
    rememberSessionScope(session, frozenScope(), true)
    const changed = frozenScope()
    changed.roots[0].path = join(directory, 'another-checkout')
    expect(() => rememberSessionScope(session, changed, false)).toThrow('agent_session_conflict')
    expect(sessionScopeFor(session)).toEqual(frozenScope())
    rememberSessionScope(session, changed, true)
    expect(sessionScopeFor(session)).toEqual(changed)
  })

  it('refuses a scope attached to the wrong Workspace before persistence', () => {
    const wrongOwner = frozenScope()
    wrongOwner.workspaceId = 'another-workspace'
    expect(() => rememberSessionScope(session, wrongOwner, true)).toThrow(
      'agent_session_operation_invalid'
    )
    expect(sessionScopeFor(session)).toBeUndefined()
  })

  it('reads roots a pre-store record carried, then keeps them in the store', async () => {
    const saved = await store.reserveOwner(request())
    const legacy = { ...saved.record, localWorkspaceScope: frozenScope() }
    expect(sessionScopeFor(legacy)).toEqual(frozenScope())
    expect(sessionScopeFor(saved.record)).toEqual(frozenScope())
  })
})

describe('providers use the saved roots instead of current catalog defaults', () => {
  it.each([false, true])('Codex uses its frozen cwd and roots (resume=%s)', async (resuming) => {
    const record = scopedRecord('codex', resuming)
    const resolveWorkspacePath = vi.fn(async () => join(directory, 'changed-default'))
    const resolve = createCodexStructuredLaunchResolver({
      store: { getRecord: () => record, pinLaunchDirectory: vi.fn() },
      resolveWorkspacePath,
      resolveCommand: () => '/test/codex',
      resolveLaunchArgs: () => []
    })
    const launch = await resolve({ identity: identityFor(record) })
    expect(launch.cwd).toBe(join(directory, 'app-b'))
    expect(launch).toMatchObject({
      localWorkspaceScope: frozenScope(),
      resumeThreadId: resuming ? 'original-thread' : null,
      permissionPolicy: codexStructuredPermissionPolicy('ask')
    })
    expect(resolveWorkspacePath).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'Claude gets all roots and additive context (resume=%s)',
    async (resuming) => {
      const record = scopedRecord('claude', resuming)
      const resolveWorkspacePath = vi.fn(async () => join(directory, 'changed-default'))
      const resolve = createClaudeStructuredLaunchResolver({
        store: { getRecord: () => record, pinLaunchDirectory: vi.fn() },
        resolveWorkspacePath,
        resolveCommand: () => '/test/claude',
        resolveAuthPolicy: () => ({ account: 'system' }),
        resolveLaunchArgs: () => [],
        hasTranscript: async () => resuming
      })
      const launch = await resolve({ identity: identityFor(record) })
      expect(launch.cwd).toBe(join(directory, 'app-b'))
      expect(launch.options).toMatchObject({
        additionalDirectories: expect.arrayContaining([
          join(directory, 'app-a'),
          join(directory, 'app-b')
        ]),
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: expect.stringContaining('App A')
        }
      })
      expect(launch.options.systemPrompt).toMatchObject({
        append: expect.stringContaining('App B')
      })
      if (resuming) {
        expect(launch.options.resume).toBe('original-session')
      }
      expect(resolveWorkspacePath).not.toHaveBeenCalled()
    }
  )
})
