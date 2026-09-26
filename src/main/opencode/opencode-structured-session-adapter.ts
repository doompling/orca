import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import {
  AgentSessionAcquisitionExitUnprovenError,
  AgentSessionPromptUnavailableError
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { supportsNativeStructuredLocation } from '../native-chat/structured-agent-session-location-support'
import { acquireOpenCodeSession, createOpenCodeOwner } from './opencode-structured-session-acquire'
import {
  assertOpenCodeOwner,
  type OpenCodeSessionOwner,
  type OpenCodeStructuredSessionAdapterDeps
} from './opencode-structured-session-state'
import { dispatchOpenCodeMessage } from './opencode-session-dispatch'
import { openCodeOptions, selectOpenCodeModel } from './opencode-session-options'
import { openCodeHistoryWindow, readOpenCodeHistory } from './opencode-session-history'
import { openCodeSessionPath } from './opencode-session-protocol'
import { replyOpenCodePrompt } from './opencode-session-prompts'

export type { OpenCodeStructuredSessionAdapterDeps } from './opencode-structured-session-state'

export function createOpenCodeStructuredSessionAdapter(
  deps: OpenCodeStructuredSessionAdapterDeps
): StructuredAgentSessionAdapter & { closeAll(): Promise<void> } {
  const owners = new Map<string, OpenCodeSessionOwner>()
  const acquiring = new Set<string>()
  function current(sessionId: string, fence?: number) {
    const owner = owners.get(sessionId)
    if (!owner || !owner.published) {
      throw new Error('OpenCode session is not attached.')
    }
    assertOpenCodeOwner(owner, fence)
    return owner
  }
  async function close(sessionId: string, requested = true): Promise<boolean> {
    const owner = owners.get(sessionId)
    if (!owner) {
      return true
    }
    if (requested) {
      owner.requestedClose = true
    }
    await owner.ready
    const exited = owner.connection ? await owner.connection.close() : true
    if (!exited) {
      return false
    }
    owner.unbind?.()
    owner.translator?.stopped(requested)
    if (owner.published && !owner.notified) {
      owner.notified = true
      deps.onEvent?.({
        type: 'ended',
        sessionId,
        reason: requested ? 'OpenCode session closed.' : 'OpenCode connection ended.',
        cause: requested ? 'requested-close' : 'unexpected-exit',
        fence: owner.input.fence,
        acquisitionGeneration: owner.generation,
        observedAt: deps.now?.() ?? Date.now()
      })
    }
    return true
  }
  function failed(owner: OpenCodeSessionOwner, _reason: Error) {
    if (owner.requestedClose || owner.failed) {
      return
    }
    owner.failed = true
    if (owner.published) {
      void close(owner.input.identity.sessionId, false).catch(() => {})
    }
  }
  return {
    supportsLocation: supportsNativeStructuredLocation,
    supportsCreate: (location, agent) =>
      agent === 'opencode' && supportsNativeStructuredLocation(location),
    async acquire(input) {
      if (acquiring.has(input.identity.sessionId)) {
        throw new Error('OpenCode acquisition is already in progress.')
      }
      acquiring.add(input.identity.sessionId)
      try {
        const previous = owners.get(input.identity.sessionId)
        if (previous && !(await close(input.identity.sessionId))) {
          throw new AgentSessionAcquisitionExitUnprovenError(
            new Error('The previous OpenCode owner has not exited.')
          )
        }
        const owner = createOpenCodeOwner(input)
        owners.set(input.identity.sessionId, owner)
        return await acquireOpenCodeSession(owner, deps, failed)
      } finally {
        acquiring.delete(input.identity.sessionId)
      }
    },
    async dispatch(input) {
      return dispatchOpenCodeMessage(current(input.sessionId, input.fence), input)
    },
    async cancelTurn(input) {
      const owner = current(input.sessionId, input.fence)
      if (
        !owner.connection ||
        !owner.providerSessionId ||
        owner.translator?.activeTurn !== input.turnId ||
        owner.cancelling ||
        owner.dispatching ||
        (input.resolveLiveTurnId && input.resolveLiveTurnId() !== input.turnId)
      ) {
        return { cancelled: false }
      }
      if ([...owner.translator.prompts.values()].some((prompt) => prompt.claimed)) {
        return { cancelled: false }
      }
      owner.cancelling = true
      try {
        const result = await owner.connection.request(
          'POST',
          `${openCodeSessionPath(owner.providerSessionId)}/abort`,
          {}
        )
        if (result === true) {
          owner.translator.stopped(true)
        }
        return { cancelled: result === true }
      } finally {
        owner.cancelling = false
      }
    },
    async answerPrompt(input) {
      const owner = current(input.sessionId, input.fence)
      const prompt = owner.translator?.prompts.get(input.itemId)
      if (
        !prompt ||
        !owner.connection ||
        !owner.providerSessionId ||
        owner.cancelling ||
        prompt.body.kind !== input.kind
      ) {
        throw new AgentSessionPromptUnavailableError(input.itemId)
      }
      await replyOpenCodePrompt({
        connection: owner.connection,
        sessionId: owner.providerSessionId,
        prompt,
        optionId: input.optionId,
        commit: input.commit,
        assertCurrent: () => {
          current(input.sessionId, input.fence)
          if (owner.translator?.prompts.get(input.itemId) !== prompt) {
            throw new AgentSessionPromptUnavailableError(input.itemId)
          }
        }
      })
    },
    async setOption(input) {
      const owner = current(input.sessionId, input.fence)
      if (input.key !== 'model') {
        throw new Error(
          'OpenCode supports model selection only; effort and Fast mode are unavailable.'
        )
      }
      if (owner.dispatching || owner.translator?.busy) {
        throw new Error('Wait for the OpenCode turn before changing models.')
      }
      owner.model = selectOpenCodeModel(owner.models, input.value)
      return { model: owner.model.id }
    },
    async readOptions(input) {
      const owner = current(input.sessionId, input.fence)
      return openCodeOptions(owner.models, owner.model?.id ?? '')
    },
    readCommands: () => [],
    async providerHistoryWindow({ identity }) {
      const owner = owners.get(identity.sessionId)
      if (!owner?.connection || !owner.providerSessionId || owner.failed || owner.requestedClose) {
        return null
      }
      const history = await readOpenCodeHistory(owner.connection, owner.providerSessionId)
      return openCodeHistoryWindow(history, owner.providerSessionId, owner.translator?.busy ?? true)
    },
    closeSession: (sessionId) => close(sessionId),
    releaseAcquisition: ({ sessionId }) => close(sessionId),
    forceCloseSession: (sessionId) => close(sessionId, false),
    disposeSession: (sessionId) => close(sessionId),
    acknowledgeSessionRelease: (sessionId) => {
      if (owners.get(sessionId)?.notified) {
        owners.delete(sessionId)
      }
    },
    async closeAll() {
      await Promise.all([...owners.keys()].map((id) => close(id)))
    }
  }
}
