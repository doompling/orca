import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity,
  AgentJournalTurnItem
} from '../../shared/agent-session-journal-types'
import type { NativeChatBlock } from '../../shared/native-chat-types'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import {
  boundInlineText,
  boundPayload,
  boundToolInput,
  DEFAULT_JOURNAL_PAYLOAD_LIMITS
} from '../native-chat/agent-session-journal/journal-payload-bounds'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import {
  openCodeEventSchema,
  openCodeMessageSchema,
  openCodePartSchema,
  type OpenCodeHistory,
  type OpenCodeMessage,
  type OpenCodePart
} from './opencode-session-protocol'
import { parseOpenCodePrompt, type OpenCodePrompt } from './opencode-session-prompts'

const TEXT_LIMIT = { inlineHeadBytes: 256 * 1024 }
export function createOpenCodeJournalTranslator(input: {
  sessionId: string
  sink?: StructuredAgentSessionEventSink
  onUserMessage?: (messageId: string) => void
  now?: () => number
}) {
  const messages = new Map<string, OpenCodeMessage>()
  const parts = new Map<string, OpenCodePart>()
  const prompts = new Map<string, OpenCodePrompt>()
  const turns = new Map<string, AgentJournalTurnItem>()
  let activeTurn: string | null = null
  let busy = false
  let textBytes = 0
  const identity = (messageId: string, partId?: string): AgentJournalItemIdentity => ({
    provider: 'opencode',
    sessionId: input.sessionId,
    messageId,
    ...(partId ? { partId } : {})
  })
  function append(id: AgentJournalItemIdentity, body: AgentJournalItemBody) {
    const options = { coalescingKey: agentJournalItemKey(id) }
    if (input.sink?.tryAppendItem) {
      if (!input.sink.tryAppendItem(id, body, options).accepted) {
        throw new Error('OpenCode journal could not retain a provider event.')
      }
    } else {
      input.sink?.appendItem(id, body, options)
    }
    if (input.sink?.tryPublish) {
      if (!input.sink.tryPublish().accepted) {
        throw new Error('OpenCode journal publication failed.')
      }
    } else {
      input.sink?.publish()
    }
  }
  function turn(id: string, update: Partial<AgentJournalTurnItem>) {
    const value: AgentJournalTurnItem = {
      kind: 'turn',
      turnId: id,
      state: 'running',
      ...turns.get(id),
      ...update
    }
    turns.set(id, value)
    append(identity(`orca-turn:${id}`), value)
  }
  function render(messageId: string) {
    const message = messages.get(messageId)
    if (!message) {
      return
    }
    const blocks: NativeChatBlock[] = []
    for (const part of parts.values()) {
      if (part.messageID !== messageId || !part.text) {
        continue
      }
      if (part.type === 'text') {
        blocks.push({ type: 'text', text: boundInlineText(part.text, TEXT_LIMIT).text })
      }
    }
    if (blocks.length) {
      append(identity(messageId), { kind: 'message', role: message.role, blocks })
    }
  }
  function message(value: unknown) {
    const info = openCodeMessageSchema.parse(value)
    if (info.sessionID !== input.sessionId) {
      return
    }
    if (messages.size >= 2000 && !messages.has(info.id)) {
      throw new Error('OpenCode live history limit reached; reopen the conversation.')
    }
    const previous = messages.get(info.id)
    if (previous?.time.completed && !info.time.completed) {
      return
    }
    messages.set(info.id, info)
    if (info.role === 'user') {
      if (!turns.has(info.id)) {
        activeTurn = info.id
        busy = true
        turn(info.id, {
          startedAt: info.time.created,
          userItemId: agentJournalItemKey(identity(info.id))
        })
      }
      input.onUserMessage?.(info.id)
    } else if (
      info.parentID &&
      info.time.completed !== undefined &&
      (info.error || (info.finish && info.finish !== 'tool-calls' && info.finish !== 'unknown'))
    ) {
      turn(info.parentID, {
        state: 'completed',
        outcome: info.error ? 'failure' : 'success',
        completedAt: info.time.completed
      })
    }
    render(info.id)
  }
  function part(value: unknown) {
    const next = openCodePartSchema.parse(value)
    if (next.sessionID !== input.sessionId) {
      return
    }
    if (parts.size >= 10000 && !parts.has(next.id)) {
      throw new Error('OpenCode part retention limit reached.')
    }
    if (next.text && Buffer.byteLength(next.text) > 2 * 1024 * 1024) {
      throw new Error('OpenCode text exceeded the live buffer limit.')
    }
    textBytes +=
      Buffer.byteLength(next.text ?? '') - Buffer.byteLength(parts.get(next.id)?.text ?? '')
    if (textBytes > 8 * 1024 * 1024) {
      throw new Error('OpenCode live text retention limit reached.')
    }
    if (next.type !== 'tool') {
      parts.set(next.id, next)
    }
    if (next.type === 'tool' && next.tool && next.state) {
      const state = next.state
      const output = state.output ?? state.error
      append(identity(next.messageID, next.id), {
        kind: 'tool-call',
        name: next.tool,
        callId: next.callID,
        input: boundToolInput(state.input ?? {}, DEFAULT_JOURNAL_PAYLOAD_LIMITS),
        state:
          state.status === 'error'
            ? 'failed'
            : state.status === 'completed'
              ? 'completed'
              : 'running',
        ...(output ? { output: boundPayload(output, DEFAULT_JOURNAL_PAYLOAD_LIMITS) } : {})
      })
    } else if (next.type === 'reasoning' && next.text) {
      append(identity(next.messageID, next.id), {
        kind: 'message',
        role: 'reasoning',
        blocks: [{ type: 'text', text: boundInlineText(next.text, TEXT_LIMIT).text }]
      })
    } else {
      render(next.messageID)
    }
  }
  function event(value: unknown) {
    const parsed = openCodeEventSchema.parse(value)
    const p = parsed.properties
    if (p.sessionID !== input.sessionId) {
      return
    }
    if (parsed.type === 'message.updated') {
      message(p.info)
    } else if (parsed.type === 'message.part.updated') {
      part(p.part)
    } else if (
      parsed.type === 'message.part.delta' &&
      typeof p.partID === 'string' &&
      typeof p.delta === 'string' &&
      p.field === 'text'
    ) {
      const prior = parts.get(p.partID)
      if (!prior || prior.messageID !== p.messageID) {
        throw new Error('OpenCode delta arrived without its part snapshot.')
      }
      part({ ...prior, text: (prior.text ?? '') + p.delta })
    } else if (
      parsed.type === 'permission.asked' ||
      parsed.type === 'permission.v2.asked' ||
      parsed.type === 'question.asked' ||
      parsed.type === 'question.v2.asked'
    ) {
      const prompt = parseOpenCodePrompt(
        p,
        parsed.type.startsWith('permission') ? 'approval' : 'question',
        parsed.type.includes('.v2.'),
        input.sessionId
      )
      if (prompts.has(prompt.itemId)) {
        return
      }
      if (prompts.size >= 100) {
        throw new Error('OpenCode prompt limit reached.')
      }
      prompts.set(prompt.itemId, prompt)
      append(identity(`orca-${prompt.body.kind}:${prompt.id}`), prompt.body)
    } else if (/^(permission|question)(\.v2)?\.(replied|rejected)$/.test(parsed.type)) {
      for (const prompt of prompts.values()) {
        if (prompt.id === p.requestID || prompt.id === p.id) {
          if (!prompt.claimed) {
            prompt.body = {
              ...prompt.body,
              resolution: {
                state: 'cancelled',
                selectedOptionId: null,
                resolvedBy: null,
                resolvedAt: input.now?.() ?? Date.now()
              }
            }
            append(identity(`orca-${prompt.body.kind}:${prompt.id}`), prompt.body)
          }
          prompts.delete(prompt.itemId)
        }
      }
    } else if (parsed.type === 'session.status') {
      const status = p.status
      if (status && typeof status === 'object' && 'type' in status) {
        busy = status.type !== 'idle'
        if (!busy && activeTurn) {
          if (turns.get(activeTurn)?.state === 'running') {
            turn(activeTurn, { state: 'unverifiable' })
          }
          activeTurn = null
        }
      }
    } else if (parsed.type === 'session.error' && activeTurn) {
      turn(activeTurn, {
        state: 'completed',
        outcome: 'failure',
        completedAt: input.now?.() ?? Date.now()
      })
      append(identity(`orca-error:${activeTurn}`), {
        kind: 'status',
        text: boundInlineText(
          JSON.stringify(p.error ?? 'OpenCode session failed.'),
          DEFAULT_JOURNAL_PAYLOAD_LIMITS
        ).text
      })
    }
  }
  return {
    event,
    prompts,
    identity,
    get activeTurn() {
      return activeTurn
    },
    get busy() {
      return busy
    },
    restore(history: OpenCodeHistory) {
      for (const entry of history) {
        message(entry.info)
        for (const value of entry.parts) {
          part(value)
        }
      }
      if (activeTurn && turns.get(activeTurn)?.state !== 'running') {
        activeTurn = null
        busy = false
      }
    },
    stopped(cancelled = false) {
      if (activeTurn && turns.get(activeTurn)?.state === 'running') {
        turn(activeTurn, {
          state: cancelled ? 'interrupted' : 'unverifiable',
          ...(cancelled ? { outcome: 'cancellation' as const } : {})
        })
      }
      activeTurn = null
      busy = false
    }
  }
}
export type OpenCodeJournalTranslator = ReturnType<typeof createOpenCodeJournalTranslator>
