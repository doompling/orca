import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  AgentSessionAcquisitionExitUnprovenError,
  AgentSessionPreSpawnError,
  type AgentSessionAcquisition,
  type StructuredAgentSessionAcquireInput
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { readProcessStartTimeMs } from '../runtime/agent-session-process-identity-probe'
import { createOpenCodeJournalTranslator } from './opencode-journal-translation'
import {
  openOpenCodeServerConnection,
  OpenCodeServerStartupExitUnprovenError
} from './opencode-server-connection'
import { openOpenCodeSession } from './opencode-session-open'
import { readOpenCodeHistory } from './opencode-session-history'
import {
  assertOpenCodeOwner,
  type OpenCodeSessionOwner,
  type OpenCodeStructuredSessionAdapterDeps
} from './opencode-structured-session-state'

export function createOpenCodeOwner(
  input: StructuredAgentSessionAcquireInput
): OpenCodeSessionOwner {
  let releaseReady = () => {}
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve
  })
  return {
    input,
    generation: randomUUID(),
    connection: null,
    launch: null,
    providerSessionId: null,
    translator: null,
    models: [],
    model: null,
    published: false,
    requestedClose: false,
    failed: false,
    notified: false,
    ready,
    releaseReady,
    events: [],
    eventBytes: 0,
    submissions: new Map(),
    dispatching: false,
    cancelling: false
  }
}

export async function acquireOpenCodeSession(
  owner: OpenCodeSessionOwner,
  deps: OpenCodeStructuredSessionAdapterDeps,
  failed: (owner: OpenCodeSessionOwner, reason: Error) => void
): Promise<AgentSessionAcquisition> {
  const input = owner.input
  try {
    if (input.identity.agent !== 'opencode' || input.rewind || input.rewindRecovery) {
      throw new AgentSessionPreSpawnError(new Error('OpenCode does not support this acquisition.'))
    }
    owner.launch = await deps
      .resolveLaunch({ identity: input.identity })
      .catch((error: unknown) => {
        throw new AgentSessionPreSpawnError(error)
      })
    assertOpenCodeOwner(owner)
    const event = (value: unknown) => {
      if (owner.failed || owner.requestedClose) {
        return
      }
      try {
        if (owner.translator && owner.published) {
          owner.translator.event(value)
        } else {
          owner.eventBytes += Buffer.byteLength(JSON.stringify(value))
          if (owner.events.length >= 2000 || owner.eventBytes > 8 * 1024 * 1024) {
            throw new Error('OpenCode startup events exceeded the bounded buffer.')
          }
          owner.events.push(value)
        }
      } catch (error) {
        failed(owner, error instanceof Error ? error : new Error('OpenCode event failed.'))
      }
    }
    owner.connection = await (deps.openConnection ?? openOpenCodeServerConnection)(
      {
        ...owner.launch,
        spawnToken: input.spawnToken
      },
      {
        onEvent: event,
        onConnectionLost: (error) => failed(owner, error),
        onExit: (error) => failed(owner, error)
      }
    )
    assertOpenCodeOwner(owner)
    owner.unbind = input.events?.bindReadingControl?.(owner.connection)
    const opened = await openOpenCodeSession({
      connection: owner.connection,
      launch: owner.launch,
      identity: input.identity,
      options: input.options
    })
    assertOpenCodeOwner(owner)
    owner.providerSessionId = opened.sessionId
    owner.models = opened.models
    owner.model = opened.model
    owner.translator = createOpenCodeJournalTranslator({
      sessionId: opened.sessionId,
      sink: input.events,
      now: deps.now,
      onUserMessage: (messageId) => {
        const submission = owner.submissions.get(messageId)
        if (!submission || submission.state === 'accepted') {
          return
        }
        submission.state = 'accepted'
        deps.onDispatchSettledLate?.({
          sessionId: input.identity.sessionId,
          clientMessageId: submission.clientMessageId,
          providerIdentity: { provider: 'opencode', sessionId: opened.sessionId, messageId }
        })
      }
    })
    owner.translator.restore(await readOpenCodeHistory(owner.connection, opened.sessionId))
    await restoreOpenCodePrompts(owner)
    const statuses = z
      .record(z.string(), z.object({ type: z.string() }))
      .parse(await owner.connection.request('GET', '/session/status'))
    owner.events.push({
      type: 'session.status',
      properties: {
        sessionID: opened.sessionId,
        status: statuses[opened.sessionId] ?? { type: 'idle' }
      }
    })
    assertOpenCodeOwner(owner)
    const pid = owner.connection.pid
    const start =
      pid === undefined ? null : await (deps.readProcessStartTime ?? readProcessStartTimeMs)(pid)
    if (pid === undefined || start === null) {
      throw new Error('OpenCode process identity could not be confirmed.')
    }
    assertOpenCodeOwner(owner)
    owner.published = true
    for (const value of owner.events) {
      owner.translator.event(value)
    }
    owner.events = []
    owner.eventBytes = 0
    assertOpenCodeOwner(owner)
    return {
      process: {
        hostId: input.identity.hostId,
        pid,
        processStartTimeMs: start,
        spawnToken: input.spawnToken
      },
      link: {
        linkId: randomUUID(),
        handle: { provider: 'opencode', sessionId: opened.sessionId },
        origin: owner.launch.resumeSessionId ? 'resumed' : 'created',
        mintedAtFence: input.fence,
        observedAt: deps.now?.() ?? Date.now()
      },
      acquisitionGeneration: owner.generation
    }
  } catch (error) {
    if (error instanceof OpenCodeServerStartupExitUnprovenError) {
      owner.connection = error.connection
    }
    owner.failed = true
    owner.unbind?.()
    if (owner.connection && !(await owner.connection.close())) {
      throw new AgentSessionAcquisitionExitUnprovenError(error)
    }
    throw error
  } finally {
    owner.releaseReady()
  }
}

async function restoreOpenCodePrompts(owner: OpenCodeSessionOwner): Promise<void> {
  if (!owner.connection || !owner.providerSessionId || !owner.translator) {
    return
  }
  for (const kind of ['permission', 'question'] as const) {
    const pending = z
      .array(z.record(z.string(), z.unknown()))
      .parse(await owner.connection.request('GET', `/${kind}`))
    for (const properties of pending) {
      if (properties.sessionID === owner.providerSessionId) {
        owner.translator.event({ type: `${kind}.asked`, properties })
      }
    }
  }
}
