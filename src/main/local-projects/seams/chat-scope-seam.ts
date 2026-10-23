import type { AgentSessionAttachParams } from '../../native-chat/agent-session-wire/structured-agent-session-attach'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import { agentSessionRefusalError } from '../../../shared/agent-session-wire-refusals'
import {
  localWorkspaceLaunchScopesEqual,
  type LocalWorkspaceLaunchScope
} from '../../../shared/local-projects/agent-launch-scope'
import { isLocalWorkspaceSessionScope } from '../../../shared/local-projects/agent-session-scope'

export type { LocalWorkspaceLaunchScope }

export type AcquireWorkspaceScope = (params: AgentSessionAttachParams) => Promise<() => void>

/**
 * Holds a local Workspace's shared scope lock around a chat attach, so a root-set edit cannot race
 * a launch. Callers take it before the session's serialize lane: exclusive holders (sleep, project
 * stop, scope edits) must never wait behind a lane that waits on them.
 */
let installedAcquire: AcquireWorkspaceScope | undefined

/** Installed by the desktop runtime before its chat host starts; absent in hosts without
 *  local Workspaces. */
export function installLocalWorkspaceScopeAcquirer(
  acquire: AcquireWorkspaceScope | undefined
): void {
  installedAcquire = acquire
}

export async function withLocalWorkspaceScopeLock<T>(
  params: AgentSessionAttachParams,
  run: () => Promise<T>,
  acquire: AcquireWorkspaceScope | undefined = installedAcquire
): Promise<T> {
  const release = await acquire?.(params)
  try {
    return await run()
  } finally {
    release?.()
  }
}

/** A reservation's frozen roots must belong to its own location and may not rebind an existing
 *  chat to a different checkout; a request without roots keeps the record's. */
export function assertReservationScope(
  request: Pick<AgentSessionAttachParams, 'location' | 'localWorkspaceScope'>,
  existing: Pick<AgentSessionRecord, 'localWorkspaceScope'> | undefined
): void {
  if (!isLocalWorkspaceSessionScope(request.localWorkspaceScope, request.location)) {
    throw new Error('agent_session_operation_invalid')
  }
  if (
    existing &&
    request.localWorkspaceScope &&
    !localWorkspaceLaunchScopesEqual(existing.localWorkspaceScope, request.localWorkspaceScope)
  ) {
    throw agentSessionRefusalError('agent_session_conflict', { reason: 'identityMismatch' })
  }
}
