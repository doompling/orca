import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import { requireLegacyAgentSessionAccountHome } from '../../../shared/agent-session-account-home'
import type { EtherChatFork } from '../../../shared/ether-chat-fork'
import { materializeClaudeRewindTranscript } from '../../claude/claude-rewind-transcript'
import { resolveCodexCommand } from '../../codex-cli/command'
import { CODEX_SHORT_LIVED_PROBE_APP_SERVER_ARGS } from '../../codex-cli/codex-read-only-app-server-args'
import {
  runCodexAppServerSession,
  type CodexAppServerInvocation,
  type CodexAppServerRpc
} from '../../codex/codex-app-server-session'
import { resolveSessionFilePath } from '../session-file-resolver'
import { splitTranscriptStreamLines } from '../transcript-stream-lines'

const CODEX_FORK_TIMEOUT_MS = 30_000
const ConversationEntry = z.object({ type: z.enum(['user', 'assistant']), uuid: z.string().min(1) })
const CodexForkReply = z.object({ thread: z.object({ id: z.string().min(1) }) })

export type ChatConversationForkDeps = {
  getRecord: (sessionId: string) => AgentSessionRecord | null | undefined
  runCodexSession?: (
    invocation: CodexAppServerInvocation,
    body: (rpc: CodexAppServerRpc) => Promise<string>
  ) => Promise<string>
}

/** The last message Claude recorded, which a full copy runs through. */
async function lastClaudeMessageId(transcriptPath: string): Promise<string | undefined> {
  let last: string | undefined
  for await (const { line } of splitTranscriptStreamLines(createReadStream(transcriptPath))) {
    try {
      const entry = ConversationEntry.safeParse(JSON.parse(line))
      if (entry.success) {
        last = entry.data.uuid
      }
    } catch {
      // A torn line from a crash mid-write is skipped, as Claude's own reader does.
    }
  }
  return last
}

async function forkClaudeConversation(record: AgentSessionRecord, sessionId: string) {
  const transcript = await resolveSessionFilePath('claude', sessionId, {
    claudeProjectsDir: join(
      requireLegacyAgentSessionAccountHome(record.accountHome).path,
      'projects'
    ),
    strictErrors: true
  })
  const throughEntryId = transcript ? await lastClaudeMessageId(transcript) : undefined
  if (!transcript || !throughEntryId) {
    throw new Error("Claude hasn't saved this conversation yet. Try again after it replies.")
  }
  const forked = await materializeClaudeRewindTranscript(transcript, {
    sessionId,
    sourceSessionId: sessionId,
    replacesSessionId: sessionId,
    throughEntryId
  })
  return forked.sessionId
}

function forkCodexConversation(
  record: AgentSessionRecord,
  threadId: string,
  runSession: NonNullable<ChatConversationForkDeps['runCodexSession']>
): Promise<string> {
  const command = resolveCodexCommand()
  return runSession(
    {
      command,
      args: [...CODEX_SHORT_LIVED_PROBE_APP_SERVER_ARGS],
      cliPath: command,
      // The copy lands in the chat's own account, where the new chat will look for it.
      env: { CODEX_HOME: requireLegacyAgentSessionAccountHome(record.accountHome).path },
      timeoutMs: CODEX_FORK_TIMEOUT_MS
    },
    async (rpc) => CodexForkReply.parse(await rpc.request('thread/fork', { threadId })).thread.id
  )
}

/**
 * Copies a chat's provider conversation into a new one in the same account, leaving the chat
 * untouched. A new chat adopts the copy through the ordinary create-with-resume path.
 */
export async function forkChatConversation(
  sessionId: string,
  deps: ChatConversationForkDeps
): Promise<EtherChatFork> {
  const record = deps.getRecord(sessionId)
  if (!record || record.location.executionHostId !== 'local') {
    throw new Error('This chat is not available to copy on this computer.')
  }
  const head = record.providerHandleChain.at(-1)?.handle
  if (!head) {
    throw new Error('This chat has no conversation to copy yet. Send a message first.')
  }
  if (record.provider === 'claude') {
    return {
      agent: 'claude',
      providerSessionId: await forkClaudeConversation(record, head.nativeId)
    }
  }
  if (record.provider === 'codex') {
    return {
      agent: 'codex',
      providerSessionId: await forkCodexConversation(
        record,
        head.nativeId,
        deps.runCodexSession ?? runCodexAppServerSession
      )
    }
  }
  throw new Error('Only Claude and Codex chats can be copied.')
}
