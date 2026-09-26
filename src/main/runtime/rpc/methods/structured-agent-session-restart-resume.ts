// The restart-resume offer: list it, act on it, or turn it down.
//
// Each method reaches for records on disk this process may not have opened yet, so each builds the
// host the way hold and reveal do. Listing is read-only and takes nothing live; acting goes through
// the host's single resume path, which re-derives eligibility rather than trusting the ids it is
// given.

import { defineMethod, type RpcContext } from '../core'
import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/structured-agent-session-host'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost,
  requireStructuredProviderCapability,
  structuredProviderVisibleToClient,
  structuredCallerFor
} from './structured-agent-session-gate'
import { RestartResumableParams, RestartResumeParams } from './structured-agent-session-schemas'

async function supportedResumeIds(
  host: StructuredAgentSessionHost,
  ctx: RpcContext,
  sessionIds: readonly string[] | undefined
): Promise<readonly string[] | undefined> {
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      requireStructuredProviderCapability(ctx, host.deps?.store?.getRecord(sessionId)?.provider)
    }
    return sessionIds
  }
  if (structuredProviderVisibleToClient(ctx, 'opencode')) {
    return undefined
  }
  return (await host.restartResume.list())
    .filter((session) => structuredProviderVisibleToClient(ctx, session.agent))
    .map((session) => session.sessionId)
}

export const STRUCTURED_AGENT_SESSION_RESTART_RESUME_METHODS = [
  defineMethod({
    name: 'agentSession.restartResumable',
    params: RestartResumableParams,
    handler: async (_params, ctx) => {
      await ensureStructuredHostInstalled(ctx)
      const sessions = await requireStructuredHost(ctx).restartResume.list()
      return {
        sessions: sessions.filter((session) =>
          structuredProviderVisibleToClient(ctx, session.agent)
        )
      }
    }
  }),
  defineMethod({
    // Explicitly abandons the markers without resuming. Closing the dialog is a snooze and does
    // not call this method, so the status-bar entry can reopen the offer later.
    name: 'agentSession.restartResumableDismiss',
    params: RestartResumableParams,
    handler: async (_params, ctx) => {
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredHost(ctx)
      if (!structuredProviderVisibleToClient(ctx, 'opencode')) {
        for (const session of await host.restartResume.list()) {
          requireStructuredProviderCapability(ctx, session.agent)
        }
      }
      const dismissed = await host.restartResume.dismiss()
      // clearAll is the authoritative mutation: it removes pending and in-flight records, so a
      // second read would only add a new failure point after the user's explicit dismissal.
      return { dismissed, sessions: [] }
    }
  }),
  defineMethod({
    // Reattach AND ask each reattached agent to carry on — what the desktop prompt calls resuming,
    // and what an opted-in launch runs without asking. Separate from `restartResume`, which sends
    // nothing, but reachable from a setting rather than only from a button.
    name: 'agentSession.restartContinue',
    params: RestartResumeParams,
    handler: async (params, ctx) => {
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredHost(ctx)
      const result = await host.restartResume.continueAfterRestart(
        await supportedResumeIds(host, ctx, params.sessionIds),
        structuredCallerFor(ctx).callerKey
      )
      return {
        ...result,
        ...(result.sessions
          ? {
              sessions: result.sessions.filter((session) =>
                structuredProviderVisibleToClient(ctx, session.agent)
              )
            }
          : {})
      }
    }
  }),
  defineMethod({
    // Reattach only, no send. No Orca surface calls it now — the desktop prompt's single action is
    // resume-and-continue — but it is a PUBLISHED wire method, so dropping it is a wire removal an
    // older or non-desktop client would meet as an unknown method.
    name: 'agentSession.restartResume',
    params: RestartResumeParams,
    handler: async (params, ctx) => {
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredHost(ctx)
      return {
        results: await host.restartResume.resume(
          await supportedResumeIds(host, ctx, params.sessionIds),
          structuredCallerFor(ctx).callerKey
        )
      }
    }
  })
]
