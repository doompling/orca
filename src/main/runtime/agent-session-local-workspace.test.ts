import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import type { AgentSessionProviderHandleLink } from '../../shared/agent-session-provider-handle'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { createClaudeStructuredLaunchResolver } from '../claude/claude-structured-launch-resolution'
import { createCodexStructuredLaunchResolver } from '../codex/codex-structured-launch-resolution'
import {
  admitAttachOrRefuse,
  reserveRequestFor
} from '../native-chat/agent-session-wire/structured-agent-session-attach'
import { attachParamsForRecord } from '../native-chat/agent-session-wire/structured-agent-session-read-restore'
import { AgentSessionRecordStore } from './agent-session-record-store'
import type { AgentSessionReserveRequest } from './agent-session-reservation-admission'

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

function request(
  provider: 'codex' | 'claude' = 'codex',
  overrides: Partial<AgentSessionReserveRequest> = {}
): AgentSessionReserveRequest {
  nextOperation += 1
  return {
    sessionId: `session-${provider}`,
    provider,
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'folder:workspace-a',
      workspaceKind: 'folder'
    },
    accountHome: {
      variable: provider === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR',
      path: join(directory, 'account')
    },
    localWorkspaceScope: frozenScope(),
    runtimeKind: 'native',
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

function identity(provider: 'codex' | 'claude'): AgentSessionJournalIdentity {
  return {
    sessionId: `session-${provider}`,
    workspaceId: 'folder:workspace-a',
    hostId: 'local',
    agent: provider,
    providerHandle:
      provider === 'codex'
        ? { kind: 'codex', threadId: 'original-thread' }
        : { kind: 'claude', sessionId: 'original-session', leafUuid: 'original-leaf' }
  }
}

function adoptedLink(provider: 'codex' | 'claude'): AgentSessionProviderHandleLink {
  return {
    linkId: 'original-handle',
    origin: 'adopted',
    mintedAtFence: 1,
    observedAt: NOW,
    handle:
      provider === 'codex'
        ? { provider, threadId: 'original-thread' }
        : { provider, sessionId: 'original-session', leafUuid: 'original-leaf' }
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-chat-record-roots-'))
  nextOperation = 0
  await Promise.all(frozenScope().roots.map((root) => mkdir(root.path)))
  store = await AgentSessionRecordStore.open({
    directory: join(directory, 'sessions'),
    hostId: 'local'
  })
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('multi-root chat durable record', () => {
  it('copies the first roots into the existing record store and restores them after reopen', async () => {
    const original = frozenScope()
    const saved = await store.reserveOwner(request('codex', { localWorkspaceScope: original }))
    original.roots[0].path = join(directory, 'changed-after-launch')
    expect(saved.record.localWorkspaceScope).toEqual(frozenScope())
    const restored = await AgentSessionRecordStore.open({
      directory: join(directory, 'sessions'),
      hostId: 'local'
    })
    expect(restored.getRecord('session-codex')?.localWorkspaceScope).toEqual(frozenScope())
    expect(restored.isSessionUnreadable('session-codex')).toBe(false)
  })

  it('keeps roots on ordinary reacquisition even when no new scope is supplied', async () => {
    const saved = await store.reserveOwner(request())
    const reacquired = await store.reserveOwner(
      request('codex', {
        expectedFence: saved.record.lease.runtimeFence,
        localWorkspaceScope: undefined
      })
    )
    expect(reacquired.record.localWorkspaceScope).toEqual(frozenScope())
  })

  it('keeps the frozen roots through restored attach identity and reservation translation', async () => {
    const { record } = await store.reserveOwner(request())
    const params = attachParamsForRecord(record, {
      clientOperationId: `${NOW}-${'2'.repeat(32)}`,
      expectedRuntimeFence: record.lease.runtimeFence
    })
    expect(params.localWorkspaceScope).toEqual(frozenScope())
    const admitted = admitAttachOrRefuse(params)
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) {
      throw new Error(admitted.refusal.message)
    }
    const translated = reserveRequestFor({
      params,
      sessionId: record.sessionId,
      callerKey: 'test-client',
      fingerprint: admitted.fingerprint,
      now: NOW,
      authority: {
        spawnToken: 'next-spawn',
        claimKeyId: 'test-key',
        handoffOperationId: null,
        probe: { outcome: 'reservation-unused' }
      }
    })
    expect(translated.localWorkspaceScope).toEqual(frozenScope())
  })

  it('refuses rebinding an existing session to a changed checkout', async () => {
    const saved = await store.reserveOwner(request())
    const changed = frozenScope()
    changed.roots[0].path = join(directory, 'another-checkout')
    await expect(
      store.reserveOwner(
        request('codex', {
          expectedFence: saved.record.lease.runtimeFence,
          localWorkspaceScope: changed
        })
      )
    ).rejects.toThrow('agent_session_conflict')
    expect(store.getRecord('session-codex')?.localWorkspaceScope).toEqual(frozenScope())
  })

  it('refuses a scope attached to the wrong Workspace before persistence', async () => {
    const wrongOwner = frozenScope()
    wrongOwner.workspaceId = 'another-workspace'
    await expect(
      store.reserveOwner(request('codex', { localWorkspaceScope: wrongOwner }))
    ).rejects.toThrow('agent_session_operation_invalid')
    expect(store.listRecords()).toEqual([])
  })
})

describe('providers use the saved roots instead of current catalog defaults', () => {
  it.each([false, true])('Codex uses its frozen cwd and roots (resume=%s)', async (resuming) => {
    await store.reserveOwner(
      request('codex', resuming ? { adoptedHandleLink: adoptedLink('codex') } : {})
    )
    const resolveWorkspacePath = vi.fn(async () => join(directory, 'changed-default'))
    const resolve = createCodexStructuredLaunchResolver({
      store,
      resolveWorkspacePath,
      resolveCommand: () => '/test/codex',
      resolveRollout: async () => null,
      isWindowsProcessStartTimeAvailable: () => true,
      resolvePermissionPolicy: () => ({ approvalPolicy: 'on-request', sandbox: 'workspace-write' })
    })
    const launch = await resolve({ identity: identity('codex') })
    expect(launch).toMatchObject({
      cwd: join(directory, 'app-b'),
      localWorkspaceScope: frozenScope(),
      resumeThreadId: resuming ? 'original-thread' : null,
      permissionPolicy: { approvalPolicy: 'on-request', sandbox: 'workspace-write' }
    })
    expect(launch.localWorkspaceScope).not.toBe(
      store.getRecord('session-codex')?.localWorkspaceScope
    )
    expect(resolveWorkspacePath).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'Claude gets all roots and additive context (resume=%s)',
    async (resuming) => {
      await store.reserveOwner(
        request('claude', resuming ? { adoptedHandleLink: adoptedLink('claude') } : {})
      )
      const resolveWorkspacePath = vi.fn(async () => join(directory, 'changed-default'))
      const resolve = createClaudeStructuredLaunchResolver({
        store,
        resolveWorkspacePath,
        resolveCommand: () => '/test/claude',
        resolveAuthPolicy: () => ({ stripAuthEnv: false }),
        resolvePermissionMode: () => 'default'
      })
      const launch = await resolve({ identity: identity('claude') })
      expect(launch.cwd).toBe(join(directory, 'app-b'))
      expect(launch.options).toMatchObject({
        additionalDirectories: [join(directory, 'app-a'), join(directory, 'app-b')],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: expect.stringContaining('App A')
        },
        settingSources: ['user', 'project', 'local'],
        extraArgs: { 'replay-user-messages': null }
      })
      expect(launch.options.systemPrompt).toMatchObject({
        append: expect.stringContaining('App B')
      })
      expect(launch.options.permissionMode).toBeUndefined()
      expect(launch.options.allowDangerouslySkipPermissions).toBeUndefined()
      expect(launch.options.extraArgs).not.toHaveProperty('dangerously-skip-permissions')
      expect(launch.resumed).toBe(resuming)
      if (resuming) {
        expect(launch.options.resume).toBe('original-session')
        expect(launch.options.resumeSessionAt).toBe('original-leaf')
      }
      expect(resolveWorkspacePath).not.toHaveBeenCalled()
    }
  )
})
