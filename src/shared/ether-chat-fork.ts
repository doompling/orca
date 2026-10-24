/** A copy of a chat's provider conversation, ready for a new chat to adopt. */
export type EtherChatFork = {
  agent: 'claude' | 'codex'
  /** Claude's session id, or Codex's thread id, of the copy. */
  providerSessionId: string
}

export type EtherChatApi = {
  /** Copies the chat's conversation; the chat itself is unchanged. */
  forkConversation: (sessionId: string) => Promise<EtherChatFork>
}
