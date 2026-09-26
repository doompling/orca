import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import {
  decodeAgentSessionQuestionAnswers,
  isValidAgentSessionQuestionAnswers
} from '../../shared/agent-session-question-answer'
import type {
  AgentJournalApprovalItem,
  AgentJournalQuestionItem
} from '../../shared/agent-session-journal-types'
import { AgentSessionPromptUnavailableError } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { OpenCodeServerConnection } from './opencode-server-connection-types'
import { openCodePermissionSchema, openCodeQuestionSchema } from './opencode-session-protocol'

export type OpenCodePrompt = {
  id: string
  itemId: string
  v2: boolean
  claimed: boolean
  body: AgentJournalApprovalItem | AgentJournalQuestionItem
}
export function parseOpenCodePrompt(
  value: unknown,
  kind: 'approval' | 'question',
  v2: boolean,
  sessionId: string
): OpenCodePrompt {
  const request =
    kind === 'approval'
      ? openCodePermissionSchema.parse(value)
      : openCodeQuestionSchema.parse(value)
  if (request.sessionID !== sessionId) {
    throw new Error('OpenCode prompt belongs to another conversation.')
  }
  const messageId = `orca-${kind}:${request.id}`
  const itemId = agentJournalItemKey({ provider: 'opencode', sessionId, messageId })
  if (kind === 'approval') {
    const permission = openCodePermissionSchema.parse(value)
    return {
      id: request.id,
      itemId,
      v2,
      claimed: false,
      body: {
        kind: 'approval',
        title: permission.permission ?? permission.action ?? 'OpenCode permission',
        detail: (permission.patterns ?? permission.resources ?? []).join('\n').slice(0, 16384),
        options: [
          { id: 'once', label: 'Allow once' },
          { id: 'reject', label: 'Reject' }
        ],
        resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
      }
    }
  }
  const question = openCodeQuestionSchema.parse(value)
  const questions = question.questions.map((entry, index) => ({
    id: `${request.id}:${index}`,
    question: entry.question,
    header: entry.header,
    multiSelect: entry.multiple === true,
    options: entry.options.map((option, choice) => ({
      id: `${choice}`,
      label: option.label,
      description: option.description
    })),
    ...(entry.custom !== false ? { freeTextQuestionId: `${request.id}:${index}` } : {})
  }))
  return {
    id: request.id,
    itemId,
    v2,
    claimed: false,
    body: {
      kind: 'question',
      question: questions[0].question,
      options: questions[0].options,
      questions,
      resolution: { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null }
    }
  }
}

export async function replyOpenCodePrompt(input: {
  connection: OpenCodeServerConnection
  sessionId: string
  prompt: OpenCodePrompt
  optionId: string
  commit: () => Promise<void>
  assertCurrent: () => void
}): Promise<void> {
  const { prompt } = input
  if (prompt.claimed || prompt.body.resolution.state !== 'pending') {
    throw new AgentSessionPromptUnavailableError(prompt.itemId)
  }
  const body =
    prompt.body.kind === 'approval'
      ? approvalReply(input.optionId)
      : questionReply(prompt.body, input.optionId)
  prompt.claimed = true
  let committed = false
  try {
    await input.commit()
    committed = true
    input.assertCurrent()
    const kind = prompt.body.kind === 'approval' ? 'permission' : 'question'
    const prefix = prompt.v2
      ? `/api/session/${encodeURIComponent(input.sessionId)}/${kind}`
      : `/${kind}`
    await input.connection.request('POST', `${prefix}/${encodeURIComponent(prompt.id)}/reply`, body)
  } finally {
    // A lost reply remains claimed; only provider reconciliation may release it.
    if (!committed) {
      prompt.claimed = false
    }
  }
}

function approvalReply(optionId: string) {
  if (optionId !== 'once' && optionId !== 'reject') {
    throw new Error('Unsupported OpenCode approval choice.')
  }
  return { reply: optionId }
}
function questionReply(question: AgentJournalQuestionItem, optionId: string) {
  const answers = decodeAgentSessionQuestionAnswers(optionId)
  const questions = question.questions ?? []
  if (!answers || !isValidAgentSessionQuestionAnswers(questions, answers)) {
    throw new Error('The OpenCode question answer does not match the offered choices.')
  }
  return {
    answers: questions.map((entry) => {
      const answer = answers.find((value) => value.questionId === entry.id)
      return [
        ...(answer?.optionIds.map(
          (id) => entry.options.find((option) => option.id === id)?.label ?? ''
        ) ?? []),
        ...(answer?.other?.trim() ? [answer.other] : [])
      ]
    })
  }
}
