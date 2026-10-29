import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import {
  assertLocalWorkspaceLaunchScopeOwner,
  captureLocalWorkspaceLaunchScope,
  type LocalWorkspaceLaunchScope
} from '../../shared/local-projects/agent-launch-scope'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import { rememberSessionScope, sessionScopeFor } from './session-scope-store'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatusForPath
} from '../project-groups/folder-workspace-path-status'

function captureStructuredLocalWorkspaceScope(
  store: Pick<RuntimeStore, 'resolveLocalWorkspace'>,
  location: AgentSessionExecutionLocation
): LocalWorkspaceLaunchScope | undefined {
  if (
    location.executionHostId !== 'local' ||
    location.wslDistro !== null ||
    location.workspaceKind !== 'folder'
  ) {
    return undefined
  }
  const owner = parseWorkspaceKey(location.workspaceId)
  const workspace =
    owner?.type === 'folder' ? store.resolveLocalWorkspace?.(owner.folderWorkspaceId) : null
  return workspace ? captureLocalWorkspaceLaunchScope(workspace) : undefined
}

/** Freezes a new chat's roots before it is reserved; the host captures them, never a client. */
export function rememberStructuredLocalWorkspaceScope(
  store: Pick<RuntimeStore, 'resolveLocalWorkspace'>,
  sessionId: string,
  location: AgentSessionExecutionLocation
): void {
  const scope = captureStructuredLocalWorkspaceScope(store, location)
  if (scope) {
    const recorded = getStructuredAgentSessionHost()?.deps.store.getConversation(sessionId)
    rememberSessionScope({ sessionId, location }, scope, !recorded)
  }
}

export async function readStructuredLocalWorkspaceScope(record: {
  sessionId: string
  location: AgentSessionExecutionLocation
}): Promise<LocalWorkspaceLaunchScope | undefined> {
  const scope = sessionScopeFor(record)
  if (!scope) {
    return undefined
  }
  if (
    record.location.executionHostId !== 'local' ||
    record.location.wslDistro !== null ||
    record.location.workspaceKind !== 'folder'
  ) {
    throw new Error('Local Workspace agent roots cannot run on another execution host.')
  }
  assertLocalWorkspaceLaunchScopeOwner(scope, record.location.workspaceId)
  await Promise.all(
    [...new Set([...scope.roots.map((root) => root.path), scope.cwd])].map(async (path) => {
      const status = await getFolderWorkspacePathStatusForPath({
        folderPath: path,
        repos: [],
        projectGroups: []
      })
      assertFolderWorkspacePathUsable(status)
    })
  )
  return scope
}
