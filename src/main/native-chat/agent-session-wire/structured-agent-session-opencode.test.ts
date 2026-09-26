import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../../shared/agent-session-record.test-fixture'
import { isAgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentSessionAttachParams } from './structured-agent-session-attach'
import { journalIdentityFor } from './structured-agent-session-attach'
import { providerHistoryId } from './agent-session-journal-recovery'
import { structuredAgentSessionProviderSessionMetadata } from './structured-agent-session-history-result'
import {
  adapterSupportsCreateIfDeclared,
  adapterSupportsRecord
} from './structured-agent-session-provider-support'
import { structuredTuiTranscriptImportOptions } from './structured-agent-session-host-handoff'
import { CALLER, envelope, hostTestState } from './structured-agent-session-host-test-harness'
import {
  HOST_TEST_NOW,
  HOST_TEST_SESSION,
  hostTestAttachParams
} from './structured-agent-session-host-test-data'
import { captureLocalWorkspaceLaunchScope } from '../../../shared/local-projects/agent-launch-scope'

const home = {
  variable: 'XDG_DATA_HOME' as const,
  path: '/home/test/data',
  configHome: '/home/test/config'
}
function params(overrides: Partial<AgentSessionAttachParams> = {}, fence: number | null = null) {
  return hostTestAttachParams(fence, {
    provider: 'opencode',
    agent: 'opencode',
    accountHome: home,
    providerHandle: { kind: 'opencode', sessionId: 'ses_example' },
    ...overrides
  })
}

beforeEach(() => {
  const { host, acquire, store } = hostTestState()
  host.deps.adapter.supportsCreate = (_location, agent) => agent === 'opencode'
  host.deps.adapter.closeSession = async () => true
  acquire.mockImplementation(async ({ fence, spawnToken }) => ({
    process: { hostId: 'local', pid: 4000, processStartTimeMs: HOST_TEST_NOW, spawnToken },
    link: {
      linkId: `opencode-${fence}`,
      handle: { provider: 'opencode', sessionId: 'ses_example' },
      origin: store.getRecord(HOST_TEST_SESSION)?.providerHandleChain.length
        ? 'resumed'
        : 'created',
      mintedAtFence: fence,
      observedAt: HOST_TEST_NOW
    }
  }))
})

describe('OpenCode native host identity', () => {
  it('uses the existing record, journal and history after close and resume', async () => {
    const { host, store, acquire } = hostTestState()
    expect(await host.attach(CALLER, params())).toMatchObject({ ok: true })
    const record = store.getRecord(HOST_TEST_SESSION)!
    expect(isAgentSessionRecord(record)).toBe(true)
    const identity = journalIdentityFor(record, params())
    expect(identity.providerHandle).toEqual({ kind: 'opencode', sessionId: 'ses_example' })
    expect(providerHistoryId(identity.providerHandle)).toBe('ses_example')
    expect(structuredAgentSessionProviderSessionMetadata(record)).toEqual({
      key: 'session_id',
      id: 'ses_example'
    })
    const item = {
      provider: 'opencode' as const,
      sessionId: 'ses_example',
      messageId: 'msg_one',
      partId: 'part_one'
    }
    acquire.mock.calls.at(-1)?.[0].events?.appendItem(item, {
      kind: 'message',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'Retained reply' }]
    })
    await host.flushStreamedEvents(HOST_TEST_SESSION)
    await host.close(HOST_TEST_SESSION)
    expect(
      await host.attach(CALLER, params({}, store.getRecord(HOST_TEST_SESSION)!.lease.runtimeFence))
    ).toMatchObject({ ok: true })
    expect(acquire).toHaveBeenCalledTimes(2)
    const restored = store.getRecord(HOST_TEST_SESSION)!
    expect(restored.accountHome).toEqual(home)
    expect(restored.providerHandleChain.map((link) => link.handle)).toEqual([
      record.providerHandleChain[0]!.handle,
      record.providerHandleChain[0]!.handle
    ])
    expect(host.history({ sessionId: HOST_TEST_SESSION, direction: 'tail' })).toMatchObject({
      ok: true,
      providerSession: { key: 'session_id', id: 'ses_example' },
      page: {
        items: expect.arrayContaining([
          expect.objectContaining({ itemId: agentJournalItemKey(item) })
        ])
      }
    })
  })

  it('refuses account/config changes instead of moving a conversation', async () => {
    const { host, store, acquire } = hostTestState()
    expect(await host.attach(CALLER, params())).toMatchObject({ ok: true })
    for (const field of ['path', 'configHome', 'configFile', 'configDir'] as const) {
      expect(
        await host.attach(
          CALLER,
          params(
            { accountHome: { ...home, [field]: '/different' } },
            store.getRecord(HOST_TEST_SESSION)!.lease.runtimeFence
          )
        )
      ).toMatchObject({ ok: false, refusal: { code: 'agent_session_conflict' } })
    }
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(store.getRecord(HOST_TEST_SESSION)!.accountHome).toEqual(home)
  })

  it('refuses unsupported owners and adopted transcripts before reservation or acquire', async () => {
    const { host, store, acquire } = hostTestState()
    const invalid: Partial<AgentSessionAttachParams>[] = [
      { runtimeKind: 'tui' },
      { agent: 'claude' },
      { provider: 'codex' },
      { accountHome: { ...home, configDir: 'relative' } },
      { location: { ...params().location, wslDistro: 'Ubuntu' } },
      { location: { ...params().location, executionHostId: 'ssh:remote' } },
      {
        adopt: {
          providerHandle: { kind: 'opencode', sessionId: 'ses_other' },
          transcriptPath: '/not/read'
        }
      }
    ]
    for (const overrides of invalid) {
      expect(await host.attach(CALLER, params(overrides))).toMatchObject({
        ok: false,
        refusal: { code: 'structured_agent_session_unsupported' }
      })
    }
    expect(acquire).not.toHaveBeenCalled()
    expect(store.listRecords()).toEqual([])
  })

  it('refuses handoff and rewind without touching the provider', async () => {
    const { host, store } = hostTestState()
    expect(await host.attach(CALLER, params())).toMatchObject({ ok: true })
    const rewind = vi.fn(async () => ({ ok: true as const }))
    host.deps.adapter.rewindSupport = () => ({ supported: true })
    host.deps.adapter.rewind = rewind
    const record = store.getRecord(HOST_TEST_SESSION)!
    expect(() => structuredTuiTranscriptImportOptions(record)).toThrow(
      'structured_agent_session_unsupported'
    )
    const fields = { direction: 'to-tui' as const, mode: 'now' as const, action: 'start' as const }
    expect(
      await host.requestHandoff(CALLER, {
        ...fields,
        envelope: envelope('agentSession.requestHandoff', fields)
      })
    ).toMatchObject({ ok: false, refusal: { code: 'structured_agent_session_unsupported' } })
    const target = {
      itemId: 'not-a-target',
      expectedEpoch: host.journalSnapshot(HOST_TEST_SESSION).cursor.epoch
    }
    expect(
      await host.rewind(CALLER, { ...target, envelope: envelope('agentSession.rewind', target) })
    ).toMatchObject({ ok: false, refusal: { rewindReason: 'unsupported' } })
    expect(rewind).not.toHaveBeenCalled()
    expect(store.getRecord(HOST_TEST_SESSION)!.providerHandleChain).toEqual(
      record.providerHandleChain
    )
  })

  it('requires explicit provider support while preserving the old adapter contract', () => {
    const { host } = hostTestState()
    delete host.deps.adapter.supportsCreate
    const location = params().location
    expect(adapterSupportsCreateIfDeclared(host.deps.adapter, location, 'opencode')).toBe(false)
    expect(adapterSupportsCreateIfDeclared(host.deps.adapter, location, 'codex')).toBe(true)
    host.deps.adapter.supportsCreate = () => true
    const record = {
      ...agentSessionRecordFixture(agentSessionLeaseFixture({ runtimeKind: 'native' })),
      provider: 'opencode' as const,
      accountHome: home
    }
    expect(adapterSupportsRecord(host.deps.adapter, record)).toBe(true)
    expect(
      adapterSupportsRecord(host.deps.adapter, {
        ...record,
        location: { ...location, wslDistro: 'Ubuntu' }
      })
    ).toBe(false)
  })

  it('keeps the frozen multi-root scope when clear creates a new conversation', async () => {
    const { host, store, acquire } = hostTestState()
    const scope = captureLocalWorkspaceLaunchScope({
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      defaultRootId: 'a',
      roots: [
        { id: 'a', label: 'A', path: '/work/a' },
        { id: 'b', label: 'B', path: '/work/b' }
      ]
    })
    acquire.mockImplementation(async ({ fence, spawnToken, identity }) => ({
      process: { hostId: 'local', pid: 4000, processStartTimeMs: HOST_TEST_NOW, spawnToken },
      link: {
        linkId: `opencode-${identity.sessionId}`,
        origin: 'created',
        mintedAtFence: fence,
        observedAt: HOST_TEST_NOW,
        handle: { provider: 'opencode', sessionId: `ses_${identity.sessionId}` }
      }
    }))
    expect(
      await host.attach(
        CALLER,
        params({
          location: {
            executionHostId: 'local',
            wslDistro: null,
            workspaceKind: 'folder',
            workspaceId: 'folder:workspace-1'
          },
          localWorkspaceScope: scope,
          providerHandle: undefined
        })
      )
    ).toMatchObject({ ok: true })
    const result = await host.conversationCommand(CALLER, {
      command: 'clear',
      envelope: envelope('agentSession.conversationCommand', { command: 'clear' })
    })
    expect(result).toMatchObject({ ok: true, value: { command: 'clear', state: 'completed' } })
    if (!result.ok || !result.value.replacementSessionId) {
      throw new Error('No replacement conversation')
    }
    const replacement = store.getRecord(result.value.replacementSessionId)!
    expect(replacement.localWorkspaceScope).toEqual(scope)
    expect(replacement.accountHome).toEqual(home)
    expect(replacement.providerHandleChain[0]!.handle).not.toEqual(
      store.getRecord(HOST_TEST_SESSION)!.providerHandleChain[0]!.handle
    )
    expect(acquire).toHaveBeenCalledTimes(2)
  })
})
