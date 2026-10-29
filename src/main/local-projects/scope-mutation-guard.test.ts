import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agentSessionConversationView } from '../../shared/agent-session-conversation-view'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../shared/agent-session-record.test-fixture'
import { WorktreeTerminalMutationLock } from '../runtime/worktree-terminal-mutation-lock'
import { localWorkspaceScopeMutationGuard } from './scope-mutation-guard'
import type { RuntimeTerminalListResult } from '../../shared/runtime-types'
import type { RuntimeListingHostScope } from '../../shared/runtime-listing-host-scope'

const state = vi.hoisted(() => {
  const value: { host: unknown; persisted: boolean } = { host: null, persisted: false }
  return value
})
vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => state.host
}))
vi.mock('../runtime/structured-agent-session-runtime', () => ({
  hasPersistedStructuredAgentSessionStore: () => state.persisted
}))
vi.mock('../orca-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => '/profile'
}))

beforeEach(() => {
  state.host = null
  state.persisted = false
})
function fixture() {
  const lock = new WorktreeTerminalMutationLock()
  const hostScope: RuntimeListingHostScope = { hostIds: ['local'], omittedHostIds: [] }
  const inventory: RuntimeTerminalListResult = {
    terminals: [],
    totalCount: 0,
    truncated: false,
    hostScope
  }
  const runtime = {
    acquireWorktreeTerminalMutation: lock.acquire.bind(lock),
    listTerminals: vi.fn(async () => inventory)
  }
  return { guard: localWorkspaceScopeMutationGuard(runtime), runtime, lock, inventory, hostScope }
}
function installRecord(overrides: Parameters<typeof agentSessionLeaseFixture>[0] = {}) {
  const record = agentSessionRecordFixture(
    agentSessionLeaseFixture({ runtimeKind: 'native', ...overrides })
  )
  record.location = {
    executionHostId: 'local',
    wslDistro: null,
    workspaceId: 'folder:workspace',
    workspaceKind: 'folder'
  }
  state.host = {
    hasSession: () => true,
    deps: {
      store: {
        listConversations: () => [agentSessionConversationView(record)],
        getConversation: () => agentSessionConversationView(record),
        readOnly: false,
        recoveredFromBackup: false,
        hasUnreadableRecords: false
      }
    }
  }
  return record
}
describe('local root mutation execution guard', () => {
  it('waits for a pending spawn and excludes later spawns until validation and commit finish', async () => {
    const { guard, runtime, lock } = fixture()
    const releaseSpawn = await lock.acquire('folder:workspace', 'shared')
    const operation = vi.fn(async (check: () => Promise<void>) => {
      await check()
      return 'committed'
    })
    const update = guard(['workspace'], operation)
    expect(operation).not.toHaveBeenCalled()
    releaseSpawn()
    await expect(update).resolves.toBe('committed')
    expect(runtime.listTerminals).toHaveBeenCalledTimes(2)
    expect(runtime.listTerminals).toHaveBeenCalledWith('id:folder:workspace', 10_000, {
      requireFreshPtyLiveness: true,
      includeVisualLayouts: false
    })
    expect(lock.trackedKeyCount).toBe(0)
  })

  it('refuses incomplete local inventory and releases every lock after failure', async () => {
    const { guard, inventory, lock, hostScope } = fixture()
    inventory.truncated = true
    const operation = vi.fn(async () => 'incorrect')
    await expect(guard(['second', 'first'], operation)).rejects.toThrow('unverifiable')
    expect(operation).not.toHaveBeenCalled()
    expect(lock.trackedKeyCount).toBe(0)
    inventory.truncated = false
    hostScope.hostIds = []
    await expect(guard(['workspace'], operation)).rejects.toThrow('unverifiable')
  })

  it('refuses a live orphan terminal and never runs the mutation', async () => {
    const { guard, inventory } = fixture()
    inventory.terminals.push({
      handle: 'term_one',
      ptyId: 'pty',
      orphaned: true,
      worktreeId: 'folder:workspace',
      worktreePath: '/a',
      branch: '',
      tabId: 'tab',
      leafId: 'leaf',
      title: null,
      connected: true,
      writable: true,
      lastOutputAt: null,
      preview: '',
      executionHostId: 'local'
    })
    inventory.totalCount = 1
    const operation = vi.fn(async () => 'incorrect')
    await expect(guard(['workspace'], operation)).rejects.toThrow('Close the Workspace terminals')
    expect(operation).not.toHaveBeenCalled()
  })

  it('holds later spawns outside the entire guarded asynchronous validation', async () => {
    const { guard, lock } = fixture()
    let finish!: () => void
    const validation = new Promise<void>((resolve) => {
      finish = resolve
    })
    const operation = vi.fn(async () => {
      await validation
      return 'committed'
    })
    const editing = guard(['workspace'], operation)
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce())
    const admitted = vi.fn()
    const spawning = lock.acquire('folder:workspace', 'shared').then((release) => {
      admitted()
      release()
    })
    await Promise.resolve()
    expect(admitted).not.toHaveBeenCalled()
    finish()
    await editing
    await spawning
    expect(admitted).toHaveBeenCalledOnce()
    expect(lock.trackedKeyCount).toBe(0)
  })

  it.each(['live', 'reserved', 'conflicted'] as const)(
    'refuses a %s structured owner without guessing from activity',
    async (claimStatus) => {
      installRecord({ claimStatus })
      await expect(fixture().guard(['workspace'], async () => 'incorrect')).rejects.toThrow(
        'Stop the Workspace agents'
      )
    }
  )

  it('allows authoritative stopped history, but not an unreconciled or in-progress handoff', async () => {
    const record = installRecord({
      claimStatus: 'released',
      ownerProcess: null,
      reservedSpawnToken: null,
      deathEvidence: { kind: 'exit-observed', detail: 'closed', observedAt: 1 }
    })
    const { guard } = fixture()
    await expect(guard(['workspace'], async () => 'committed')).resolves.toBe('committed')
    record.lease.handoffStage = 'recovering'
    await expect(guard(['workspace'], async () => 'incorrect')).rejects.toThrow(
      'Stop the Workspace agents'
    )
    record.lease.handoffStage = null
    record.lease.unreconciled = true
    await expect(guard(['workspace'], async () => 'incorrect')).rejects.toThrow(
      'Stop the Workspace agents'
    )
  })

  it('does not treat an unloaded persisted host as absence, or inspect unrelated remote owners', async () => {
    state.persisted = true
    const { guard } = fixture()
    await expect(guard(['workspace'], async () => 'incorrect')).rejects.toThrow('not ready')
    const record = installRecord()
    record.location.executionHostId = 'ssh:other'
    await expect(guard(['workspace'], async () => 'committed')).resolves.toBe('committed')
  })
})
