import { createHash } from 'node:crypto'
import { localWorkspaceContextDescription } from '../../shared/local-projects/agent-launch-scope'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { OpenCodeServerHttpError } from './opencode-server-connection-types'
import { openCodeMessageSchema, openCodeSessionPath } from './opencode-session-protocol'
import { assertOpenCodeOwner, type OpenCodeSessionOwner } from './opencode-structured-session-state'

export function openCodeClientMessageId(
  sessionId: string,
  clientMessageId: string,
  requestedAt: number
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([sessionId, clientMessageId]))
    .digest('hex')
  // OpenCode sorts messages by its six-byte ascending timestamp prefix.
  const time = ((BigInt(Math.trunc(requestedAt)) * 4096n) & 0xffffffffffffn)
    .toString(16)
    .padStart(12, '0')
  return `msg_${time}${digest.slice(0, 14)}`
}

export async function dispatchOpenCodeMessage(
  owner: OpenCodeSessionOwner,
  input: Parameters<StructuredAgentSessionAdapter['dispatch']>[0]
) {
  assertOpenCodeOwner(owner, input.fence)
  const { connection, providerSessionId, model } = owner
  if (!connection || !providerSessionId || !model || !owner.published) {
    return { state: 'rejected' as const, reason: 'OpenCode is not ready.' }
  }
  if (input.body.role !== 'user' || input.body.blocks.some((block) => block.type !== 'text')) {
    return {
      state: 'rejected' as const,
      reason: 'OpenCode chat currently accepts text only; attachments are not supported.'
    }
  }
  const text = input.body.blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
  if (text.trimStart().startsWith('/')) {
    return {
      state: 'rejected' as const,
      reason: 'OpenCode slash commands are not supported in this chat.'
    }
  }
  if (
    input.requestedAt === undefined ||
    !Number.isSafeInteger(input.requestedAt) ||
    input.requestedAt < 0
  ) {
    return {
      state: 'rejected' as const,
      reason: 'OpenCode requires the original durable message timestamp.'
    }
  }
  const id = openCodeClientMessageId(input.sessionId, input.clientMessageId, input.requestedAt)
  const fingerprint = createHash('sha256').update(JSON.stringify(input.body)).digest('hex')
  const previous = owner.submissions.get(id)
  if (previous) {
    if (previous.bodyFingerprint !== fingerprint) {
      return {
        state: 'rejected' as const,
        reason: 'The message identity was reused with different content.'
      }
    }
    return previous.state === 'accepted'
      ? {
          state: 'accepted' as const,
          providerIdentity: {
            provider: 'opencode' as const,
            sessionId: providerSessionId,
            messageId: id
          }
        }
      : {
          state: 'unknown' as const,
          reason: 'OpenCode delivery is still unconfirmed; this message was not sent again.'
        }
  }
  if (
    owner.dispatching ||
    owner.cancelling ||
    owner.translator?.busy ||
    [...owner.submissions.values()].some(
      (entry) => entry.state === 'unknown' || entry.state === 'sending'
    )
  ) {
    return { state: 'rejected' as const, reason: 'Wait for the current OpenCode turn to finish.' }
  }
  owner.dispatching = true
  let submitted = false
  try {
    // Exact provider identity lookup also fences retries after a host restart.
    try {
      const existing = await connection.request(
        'GET',
        `${openCodeSessionPath(providerSessionId)}/message/${encodeURIComponent(id)}`
      )
      const result =
        existing && typeof existing === 'object' && 'info' in existing
          ? openCodeMessageSchema.parse(existing.info)
          : null
      if (
        !result ||
        result.id !== id ||
        result.sessionID !== providerSessionId ||
        result.role !== 'user'
      ) {
        throw new Error('OpenCode returned an unexpected message identity.')
      }
      return {
        state: 'accepted' as const,
        providerIdentity: {
          provider: 'opencode' as const,
          sessionId: providerSessionId,
          messageId: id
        }
      }
    } catch (error) {
      if (!(error instanceof OpenCodeServerHttpError) || error.status !== 404) {
        return {
          state: 'unknown' as const,
          reason: 'OpenCode message history could not be confirmed; nothing was sent.'
        }
      }
    }
    await input.beforeDispatch?.()
    assertOpenCodeOwner(owner, input.fence)
    if (owner.translator?.busy) {
      return { state: 'rejected' as const, reason: 'Another OpenCode turn started.' }
    }
    owner.submissions.set(id, {
      clientMessageId: input.clientMessageId,
      bodyFingerprint: fingerprint,
      state: 'sending'
    })
    submitted = true
    await connection.request('POST', `${openCodeSessionPath(providerSessionId)}/prompt_async`, {
      messageID: id,
      model: { providerID: model.providerID, modelID: model.modelID },
      agent: 'build',
      ...(owner.launch?.localWorkspaceScope
        ? { system: localWorkspaceContextDescription(owner.launch.localWorkspaceScope) }
        : {}),
      parts: [{ type: 'text', text, metadata: { orcaClientMessageId: input.clientMessageId } }]
    })
    const submission = owner.submissions.get(id)
    if (submission) {
      submission.state = 'accepted'
    }
    return {
      state: 'accepted' as const,
      providerIdentity: {
        provider: 'opencode' as const,
        sessionId: providerSessionId,
        messageId: id
      }
    }
  } catch (error) {
    if (!submitted) {
      throw error
    }
    const submission = owner.submissions.get(id)
    if (submission?.state === 'accepted') {
      return {
        state: 'accepted' as const,
        providerIdentity: {
          provider: 'opencode' as const,
          sessionId: providerSessionId,
          messageId: id
        }
      }
    }
    if (submission) {
      submission.state = 'unknown'
    }
    return {
      state: 'unknown' as const,
      reason: 'OpenCode delivery could not be confirmed. The message was not resent.'
    }
  } finally {
    owner.dispatching = false
  }
}
