import type { AgentSessionLease, AgentSessionRecord } from '../../../shared/agent-session-record'
import {
  agentSessionProviderSessionId,
  type AgentSessionHandleProvider
} from '../../../shared/agent-session-provider-handle'

export type StructuredProviderSessionOwnership = {
  sessionId: string
  workspaceId: string
  provider: AgentSessionHandleProvider
  providerSessionId: string
  lease: AgentSessionLease
}

export function listStructuredProviderSessionOwnership(
  records: readonly AgentSessionRecord[]
): StructuredProviderSessionOwnership[] {
  return records.flatMap((record) =>
    record.providerHandleChain.map((link) => ({
      sessionId: record.sessionId,
      workspaceId: record.location.workspaceId,
      provider: record.provider,
      providerSessionId: agentSessionProviderSessionId(link.handle),
      lease: record.lease
    }))
  )
}
