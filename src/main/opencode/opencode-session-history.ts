import type { ProviderHistoryWindow } from '../native-chat/agent-session-journal/journal-submission-reconciler'
import type { OpenCodeServerConnection } from './opencode-server-connection-types'
import {
  openCodeHistorySchema,
  openCodeSessionPath,
  type OpenCodeHistory
} from './opencode-session-protocol'

export async function readOpenCodeHistory(
  connection: OpenCodeServerConnection,
  sessionId: string
): Promise<OpenCodeHistory> {
  const value = await connection.request(
    'GET',
    `${openCodeSessionPath(sessionId)}/message`,
    undefined,
    { query: { limit: '500' } }
  )
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 8 * 1024 * 1024) {
    throw new Error('OpenCode conversation history exceeds the bounded restore size.')
  }
  const history = openCodeHistorySchema.parse(value)
  if (
    history.some(
      ({ info, parts }) =>
        info.sessionID !== sessionId ||
        parts.some((part) => part.sessionID !== sessionId || part.messageID !== info.id)
    )
  ) {
    throw new Error('OpenCode returned another conversation in its history.')
  }
  return history.toSorted(
    (a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id)
  )
}

export function openCodeHistoryWindow(
  history: OpenCodeHistory,
  sessionId: string,
  busy: boolean
): ProviderHistoryWindow {
  return {
    items: history
      .filter(({ info }) => info.role === 'user')
      .map(({ info, parts }) => ({
        providerItemId: info.id,
        clientMessageId: clientMessageId(parts),
        payloadFingerprint: null,
        identity: { provider: 'opencode', sessionId, messageId: info.id }
      })),
    // A bounded response does not establish an absence boundary for older sends.
    boundaryConsistent: false,
    turnInFlight: busy
  }
}

function clientMessageId(parts: OpenCodeHistory[number]['parts']): string | null {
  for (const part of parts) {
    if (typeof part.metadata?.orcaClientMessageId === 'string') {
      return part.metadata.orcaClientMessageId
    }
  }
  return null
}
