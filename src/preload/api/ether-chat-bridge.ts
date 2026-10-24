import { ipcRenderer } from 'electron'
import type { EtherChatApi } from '../../shared/ether-chat-fork'

export const etherChatApi = {
  forkConversation: (sessionId) => ipcRenderer.invoke('etherChat:forkConversation', sessionId)
} satisfies EtherChatApi
