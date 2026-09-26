import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OPENCODE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { RuntimeMobileSessionTabsSnapshot } from '../../../../shared/runtime-types'
import { setStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import {
  CALLER,
  hostTestState
} from '../../../native-chat/agent-session-wire/structured-agent-session-host-test-harness'
import {
  HOST_TEST_NOW,
  HOST_TEST_SESSION,
  hostTestAttachParams
} from '../../../native-chat/agent-session-wire/structured-agent-session-host-test-data'
import type { StructuredAgentSessionResumeCandidate } from '../../../native-chat/agent-session-wire/structured-agent-session-restart-resume-set'
import { call, runtimeCalls, STRUCTURED_CLIENT } from './structured-agent-session-rpc.test-fixture'
import {
  assertAgentSessionTabDestructiveMutationSupported,
  projectSessionTabAgentStatus
} from './session-tab-agent-status-projection'

const capable = {
  ...STRUCTURED_CLIENT,
  clientCapabilities: [
    ...STRUCTURED_CLIENT.clientCapabilities,
    OPENCODE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
  ]
}

beforeEach(async () => {
  const { host, acquire } = hostTestState()
  host.deps.adapter.supportsCreate = (_location, agent) => agent === 'opencode'
  acquire.mockImplementation(async ({ fence, spawnToken }) => ({
    process: { hostId: 'local', pid: 4000, processStartTimeMs: HOST_TEST_NOW, spawnToken },
    link: {
      linkId: 'opencode-1',
      handle: { provider: 'opencode', sessionId: 'ses_example' },
      origin: 'created',
      mintedAtFence: fence,
      observedAt: HOST_TEST_NOW
    }
  }))
  expect(
    await host.attach(
      CALLER,
      hostTestAttachParams(null, {
        provider: 'opencode',
        agent: 'opencode',
        accountHome: { variable: 'XDG_DATA_HOME', path: '/data', configHome: '/config' },
        providerHandle: { kind: 'opencode', sessionId: 'ses_example' }
      })
    )
  ).toMatchObject({ ok: true })
  setStructuredAgentSessionHost(host)
})
afterEach(() => setStructuredAgentSessionHost(null))

describe('OpenCode negotiated provider capability', () => {
  it('refuses create support before the runtime resolver for an older client', async () => {
    const params = { worktree: 'workspace-1', agent: 'opencode' }
    expect(await call('agentSession.createSupport', params, STRUCTURED_CLIENT)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('structured_agent_session_unsupported') }
    })
    expect(runtimeCalls.getStructuredAgentSessionCreateSupport).not.toHaveBeenCalled()
    expect(await call('agentSession.createSupport', params, capable)).toMatchObject({
      ok: true,
      result: { supported: true }
    })
  })

  it.each(['agentSession.history', 'agentSession.options', 'agentSession.close'])(
    'refuses %s for an older client without calling the session surface',
    async (method) => {
      const params = {
        sessionId: HOST_TEST_SESSION,
        ...(method === 'agentSession.history' ? { direction: 'tail' } : {})
      }
      expect(await call(method, params, STRUCTURED_CLIENT)).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining('structured_agent_session_unsupported') }
      })
    }
  )

  it('lets the capable desktop and in-process caller read the same saved conversation', async () => {
    for (const client of [capable, undefined]) {
      expect(
        await call(
          'agentSession.history',
          { sessionId: HOST_TEST_SESSION, direction: 'tail' },
          client
        )
      ).toMatchObject({
        ok: true,
        result: { ok: true, providerSession: { key: 'session_id', id: 'ses_example' } }
      })
    }
  })

  it('filters provider status snapshots without changing the host-owned status', async () => {
    expect(await call('agentSession.subscribeStatus', null, STRUCTURED_CLIENT)).toMatchObject({
      ok: true,
      result: { type: 'snapshot', sessions: [] }
    })
    expect(await call('agentSession.subscribeStatus', null, capable)).toMatchObject({
      ok: true,
      result: {
        type: 'snapshot',
        sessions: [expect.objectContaining({ agent: 'opencode', sessionId: HOST_TEST_SESSION })]
      }
    })
  })

  it('filters completion events but retains normal stream termination', async () => {
    const { host, store } = hostTestState()
    vi.spyOn(host, 'subscribeTurnCompletions').mockImplementation((subscriber) => {
      subscriber.emit({
        type: 'completion',
        completion: {
          sessionId: HOST_TEST_SESSION,
          scope: store.getRecord(HOST_TEST_SESSION)!.location,
          turnId: 'turn-one',
          completedAt: HOST_TEST_NOW,
          outcome: 'success'
        }
      })
      subscriber.emit({ type: 'end' })
      return () => undefined
    })
    expect(
      await call('agentSession.subscribeTurnCompletions', null, STRUCTURED_CLIENT)
    ).toMatchObject({ ok: true, result: { type: 'end' } })
    expect(await call('agentSession.subscribeTurnCompletions', null, capable)).toMatchObject({
      ok: true,
      result: { type: 'completion' }
    })
  })
})

describe('OpenCode restart and tab publication', () => {
  function candidates(): StructuredAgentSessionResumeCandidate[] {
    return ['opencode', 'codex'].map((agent) => ({
      sessionId: agent === 'opencode' ? HOST_TEST_SESSION : 'codex-session',
      workspaceId: 'workspace-1',
      agent: agent === 'opencode' ? 'opencode' : 'codex',
      work: { kind: 'turn', id: 'turn-one' },
      trigger: 'quit',
      recordedAt: HOST_TEST_NOW,
      latestPrompt: 'Fixture only',
      executionHostId: 'local',
      workspaceKind: 'folder'
    }))
  }

  it('keeps hidden provider sessions out of implicit resume/continue and refuses dismiss-all', async () => {
    const { host } = hostTestState()
    const sessions = candidates()
    vi.spyOn(host.restartResume, 'list').mockResolvedValue(sessions)
    const resume = vi.spyOn(host.restartResume, 'resume').mockResolvedValue([])
    const continueAfterRestart = vi
      .spyOn(host.restartResume, 'continueAfterRestart')
      .mockResolvedValue({ resumed: [], continued: [], sessions })
    const dismiss = vi.spyOn(host.restartResume, 'dismiss').mockResolvedValue(2)
    expect(await call('agentSession.restartResumable', {}, STRUCTURED_CLIENT)).toMatchObject({
      ok: true,
      result: { sessions: [sessions[1]] }
    })
    expect(await call('agentSession.restartResume', {}, STRUCTURED_CLIENT)).toMatchObject({
      ok: true
    })
    expect(resume).toHaveBeenCalledWith(['codex-session'], expect.any(String))
    expect(await call('agentSession.restartContinue', {}, STRUCTURED_CLIENT)).toMatchObject({
      ok: true,
      result: { sessions: [sessions[1]] }
    })
    expect(continueAfterRestart).toHaveBeenCalledWith(['codex-session'], expect.any(String))
    expect(await call('agentSession.restartResumableDismiss', {}, STRUCTURED_CLIENT)).toMatchObject(
      { ok: false }
    )
    expect(dismiss).not.toHaveBeenCalled()
    expect(
      await call(
        'agentSession.restartResume',
        { sessionIds: [HOST_TEST_SESSION] },
        STRUCTURED_CLIENT
      )
    ).toMatchObject({ ok: false })
    expect(resume).toHaveBeenCalledTimes(1)
    expect(await call('agentSession.restartResume', {}, capable)).toMatchObject({ ok: true })
    expect(resume).toHaveBeenLastCalledWith(undefined, expect.any(String))
  })

  it('hides unknown provider rows and repairs group focus, without changing the stored layout', () => {
    const snapshot: RuntimeMobileSessionTabsSnapshot = {
      worktree: 'workspace-1',
      publicationEpoch: 'epoch-1',
      snapshotVersion: 1,
      activeGroupId: 'open-group',
      activeTabId: 'agent-session:open',
      activeTabType: 'agent-session',
      tabGroups: [
        { id: 'open-group', activeTabId: 'agent-session:open', tabOrder: ['agent-session:open'] },
        { id: 'codex-group', activeTabId: 'agent-session:codex', tabOrder: ['agent-session:codex'] }
      ],
      tabGroupLayout: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'open-group' },
        second: { type: 'leaf', groupId: 'codex-group' }
      },
      tabs: [
        {
          type: 'agent-session',
          id: 'agent-session:open',
          title: 'OpenCode',
          sessionId: 'open',
          agent: 'opencode',
          isActive: true
        },
        {
          type: 'agent-session',
          id: 'agent-session:codex',
          title: 'Codex',
          sessionId: 'codex',
          agent: 'codex',
          isActive: false
        }
      ]
    }
    for (const kind of ['runtime', 'mobile'] as const) {
      const old = projectSessionTabAgentStatus(
        snapshot,
        kind,
        STRUCTURED_CLIENT.clientCapabilities,
        true
      )
      expect(old.tabs.map((tab) => tab.id)).toEqual(['agent-session:codex'])
      expect(old.activeTabId).toBe('agent-session:codex')
      expect(old.tabGroupLayout).toEqual({ type: 'leaf', groupId: 'codex-group' })
      expect(() =>
        assertAgentSessionTabDestructiveMutationSupported(
          snapshot,
          'agent-session:open',
          kind,
          STRUCTURED_CLIENT.clientCapabilities
        )
      ).toThrow('structured_agent_session_unsupported')
      expect(projectSessionTabAgentStatus(snapshot, kind, capable.clientCapabilities, true)).toBe(
        snapshot
      )
    }
    expect(snapshot.tabs).toHaveLength(2)
    expect(snapshot.activeGroupId).toBe('open-group')
  })
})
