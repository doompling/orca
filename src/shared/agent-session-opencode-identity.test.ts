import { describe, expect, it } from 'vitest'
import {
  agentSessionAccountHomesEqual,
  isAgentSessionAccountHome
} from './agent-session-account-home'
import { agentJournalItemKey, parseAgentJournalItemKey } from './agent-session-journal-item-key'
import {
  agentSessionProviderHandleRoot,
  appendAgentSessionProviderHandleLink,
  isAgentSessionProviderHandle,
  type AgentSessionProviderHandleLink
} from './agent-session-provider-handle'
import { isAgentSessionRecord, type AgentSessionRecord } from './agent-session-record'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from './agent-session-record.test-fixture'
import {
  AccountHome,
  AttachParams,
  CreateIntentParams
} from './rpc-contract/structured-agent-session-params'

const accountHome = {
  variable: 'XDG_DATA_HOME' as const,
  path: '/home/test/.local/share',
  configHome: '/home/test/.config',
  configFile: '/home/test/settings/opencode.json',
  configDir: '/home/test/opencode-config'
}
const link: AgentSessionProviderHandleLink = {
  linkId: 'link-1',
  origin: 'created',
  mintedAtFence: 7,
  observedAt: 1000,
  handle: { provider: 'opencode', sessionId: 'ses_example' }
}
function record(): AgentSessionRecord {
  return {
    ...agentSessionRecordFixture(agentSessionLeaseFixture({ runtimeKind: 'native' })),
    provider: 'opencode',
    providerHandleChain: [link],
    accountHome
  }
}

describe('OpenCode durable identity', () => {
  it('round-trips its local native record without relabeling it as another provider', () => {
    const restored: unknown = JSON.parse(JSON.stringify(record()))
    expect(isAgentSessionRecord(restored)).toBe(true)
    expect(isAgentSessionProviderHandle(link.handle)).toBe(true)
    expect(agentSessionProviderHandleRoot(link.handle)).toBe('opencode:"ses_example"')
    expect(agentSessionProviderHandleRoot(link.handle)).not.toBe(
      agentSessionProviderHandleRoot({
        provider: 'claude',
        sessionId: 'ses_example',
        leafUuid: null
      })
    )
    expect(isAgentSessionRecord(agentSessionRecordFixture())).toBe(true)
  })

  it('retains the provider session on resume and refuses a different conversation', () => {
    const resumed: AgentSessionProviderHandleLink = {
      ...link,
      linkId: 'link-2',
      origin: 'resumed',
      mintedAtFence: 8
    }
    expect(appendAgentSessionProviderHandleLink([link], resumed)).toEqual([link, resumed])
    expect(() =>
      appendAgentSessionProviderHandleLink([link], {
        ...resumed,
        handle: { provider: 'opencode', sessionId: 'ses_other' }
      })
    ).toThrow('agent_session_provider_handle_forked')
  })

  it('refuses remote, WSL, terminal and wrong-home records', () => {
    const value = record()
    for (const candidate of [
      { ...value, location: { ...value.location, executionHostId: 'ssh:remote' } },
      { ...value, location: { ...value.location, wslDistro: 'Ubuntu' } },
      { ...value, lease: { ...value.lease, runtimeKind: 'tui' } },
      { ...value, accountHome: { variable: 'CODEX_HOME', path: '/codex' } }
    ]) {
      expect(isAgentSessionRecord(candidate)).toBe(false)
    }
  })

  it('keeps message and part keys distinct, escaped and bounded', () => {
    const message = { provider: 'opencode' as const, sessionId: 'ses:a', messageId: 'msg:%b' }
    const identities = [message, { ...message, partId: '' }, { ...message, partId: 'part:c' }]
    expect(new Set(identities.map(agentJournalItemKey)).size).toBe(3)
    for (const identity of identities) {
      expect(parseAgentJournalItemKey(agentJournalItemKey(identity))).toEqual(identity)
    }
    const longKey = agentJournalItemKey({ ...message, partId: 'x'.repeat(5000) })
    expect(longKey.length).toBeLessThan(300)
    const parsed = parseAgentJournalItemKey(longKey)
    expect(parsed).not.toBeNull()
    if (parsed) {
      expect(agentJournalItemKey(parsed)).toBe(longKey)
    }
    expect(parseAgentJournalItemKey('opencode:one')).toBeNull()
    expect(parseAgentJournalItemKey('opencode:a:b:%invalid')).toBeNull()
  })
})

describe('OpenCode pinned account/config roots', () => {
  it('accepts absolute host paths and compares every frozen override', () => {
    expect(AccountHome.safeParse(accountHome).success).toBe(true)
    expect(
      isAgentSessionAccountHome({ variable: 'XDG_DATA_HOME', path: 'C:\\Users\\test\\data' })
    ).toBe(true)
    expect(agentSessionAccountHomesEqual(accountHome, { ...accountHome })).toBe(true)
    for (const key of ['path', 'configHome', 'configFile', 'configDir'] as const) {
      expect(
        agentSessionAccountHomesEqual(accountHome, { ...accountHome, [key]: '/different' })
      ).toBe(false)
    }
    expect(
      agentSessionAccountHomesEqual(accountHome, {
        variable: 'XDG_DATA_HOME',
        path: accountHome.path
      })
    ).toBe(false)
  })

  it.each(['relative/path', '~/data', '', '/path\0bad'])(
    'rejects the non-absolute or invalid path %s',
    (path) => {
      expect(isAgentSessionAccountHome({ ...accountHome, path })).toBe(false)
      expect(AccountHome.safeParse({ ...accountHome, configFile: path }).success).toBe(false)
    }
  )
})

describe('OpenCode request boundary', () => {
  const envelope = {
    sessionId: 'session-opencode',
    clientOperationId: 'operation-1',
    expectedRuntimeFence: null,
    payloadFingerprint: 'a'.repeat(64)
  }
  const params = {
    envelope,
    location: record().location,
    provider: 'opencode',
    agent: 'opencode',
    accountHome,
    runtimeKind: 'native',
    providerHandle: { kind: 'opencode', sessionId: 'ses_example' }
  }
  it('accepts fresh native create and attach, not history import', () => {
    expect(AttachParams.safeParse(params).success).toBe(true)
    const intent = { envelope, worktree: 'folder:workspace', agent: 'opencode' }
    expect(CreateIntentParams.safeParse(intent).success).toBe(true)
    expect(
      CreateIntentParams.safeParse({ ...intent, resumeFrom: { providerSessionId: 'ses_other' } })
        .success
    ).toBe(false)
  })
  it('does not admit remote, mismatched provider or terminal owners', () => {
    expect(AttachParams.safeParse({ ...params, runtimeKind: 'tui' }).success).toBe(false)
    expect(AttachParams.safeParse({ ...params, agent: 'codex' }).success).toBe(false)
    expect(AttachParams.safeParse({ ...params, provider: 'codex' }).success).toBe(false)
    expect(
      AttachParams.safeParse({ ...params, location: { ...params.location, wslDistro: 'Ubuntu' } })
        .success
    ).toBe(false)
    expect(
      AttachParams.safeParse({
        ...params,
        location: { ...params.location, executionHostId: 'ssh:remote' }
      }).success
    ).toBe(false)
  })
})
