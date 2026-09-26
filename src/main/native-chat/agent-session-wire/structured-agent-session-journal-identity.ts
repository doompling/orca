import type {
  AgentSessionJournalIdentity,
  AgentSessionProviderHandle
} from '../../../shared/agent-session-journal-types'
import { agentSessionProviderHandleChainHead } from '../../../shared/agent-session-provider-handle'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentSessionAttachParams } from './structured-agent-session-attach'

export function journalIdentityFor(
  record: AgentSessionRecord,
  params: AgentSessionAttachParams
): AgentSessionJournalIdentity {
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
  const providerHandle: AgentSessionProviderHandle =
    head?.handle.provider === 'codex'
      ? { kind: 'codex', threadId: head.handle.threadId }
      : head?.handle.provider === 'claude'
        ? {
            kind: 'claude',
            sessionId: head.handle.sessionId,
            leafUuid: head.handle.leafUuid
          }
        : head?.handle.provider === 'opencode'
          ? { kind: 'opencode', sessionId: head.handle.sessionId }
          : (params.providerHandle ?? { kind: 'opaque', agent: params.agent, value: 'pending' })
  return {
    sessionId: record.sessionId,
    workspaceId: params.location.workspaceId,
    hostId: params.location.executionHostId,
    agent: params.agent,
    providerHandle
  }
}
