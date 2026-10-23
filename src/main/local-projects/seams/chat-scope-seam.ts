import type { AgentSessionAttachParams } from '../../native-chat/agent-session-wire/structured-agent-session-attach'

export type AcquireWorkspaceScope = (params: AgentSessionAttachParams) => Promise<() => void>

/**
 * Holds a local Workspace's shared scope lock around a chat attach, so a root-set edit cannot race
 * a launch. Callers take it before the session's serialize lane: exclusive holders (sleep, project
 * stop, scope edits) must never wait behind a lane that waits on them.
 */
export async function withLocalWorkspaceScopeLock<T>(
  acquire: AcquireWorkspaceScope | undefined,
  params: AgentSessionAttachParams,
  run: () => Promise<T>
): Promise<T> {
  const release = await acquire?.(params)
  try {
    return await run()
  } finally {
    release?.()
  }
}
