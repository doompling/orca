import { ipcMain } from 'electron'
import { z } from 'zod'
import { getStructuredAgentSessionHost } from '../agent-session-wire/structured-agent-session-registry'
import { forkChatConversation } from './chat-conversation-fork'

const SessionId = z.string().min(1).max(256)

export function registerEtherChatForkHandlers(): void {
  ipcMain.removeHandler('etherChat:forkConversation')
  ipcMain.handle('etherChat:forkConversation', (_event, sessionId: unknown) =>
    forkChatConversation(SessionId.parse(sessionId), {
      getRecord: (id) => getStructuredAgentSessionHost()?.deps.store.getRecord(id)
    })
  )
}
