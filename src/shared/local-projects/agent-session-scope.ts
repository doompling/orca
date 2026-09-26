import type { AgentSessionExecutionLocation } from '../agent-session-record'
import { folderWorkspaceKey } from '../workspace-scope'
import { LocalWorkspaceLaunchScopeSchema } from './agent-launch-scope'

export function isLocalWorkspaceSessionScope(
  scope: unknown,
  location: AgentSessionExecutionLocation | undefined
): boolean {
  if (scope === undefined) {
    return true
  }
  const parsed = LocalWorkspaceLaunchScopeSchema.safeParse(scope)
  return (
    parsed.success &&
    location?.executionHostId === 'local' &&
    location.wslDistro === null &&
    location.workspaceKind === 'folder' &&
    location.workspaceId === folderWorkspaceKey(parsed.data.workspaceId)
  )
}
