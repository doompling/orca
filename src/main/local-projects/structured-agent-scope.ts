import type {
  AgentSessionExecutionLocation,
  AgentSessionRecord
} from '../../shared/agent-session-record'
import {
  assertLocalWorkspaceLaunchScopeOwner,
  captureLocalWorkspaceLaunchScope,
  copyLocalWorkspaceLaunchScope,
  type LocalWorkspaceLaunchScope
} from '../../shared/local-projects/agent-launch-scope'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatusForPath
} from '../project-groups/folder-workspace-path-status'

export function captureStructuredLocalWorkspaceScope(
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

export async function readStructuredLocalWorkspaceScope(
  record: Pick<AgentSessionRecord, 'location' | 'localWorkspaceScope'>
): Promise<LocalWorkspaceLaunchScope | undefined> {
  const scope = record.localWorkspaceScope
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
      const status = await getFolderWorkspacePathStatusForPath(
        { folderPath: path, repos: [], projectGroups: [] },
        { getSshFilesystemProvider: () => undefined }
      )
      assertFolderWorkspacePathUsable(status)
    })
  )
  return copyLocalWorkspaceLaunchScope(scope)
}
