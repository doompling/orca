import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import {
  projectLocalFolderWorkspace,
  projectLocalFolderWorkspaces
} from '../../../shared/local-projects/folder-projection'
import type { FolderWorkspacePersistenceOperations } from '../../persistence/restoring-sessions/folder-workspace-operations'
import type { LocalProjectsPersistence } from '../persistence'

type FolderWorkspaceUpdates = Parameters<
  FolderWorkspacePersistenceOperations['updateFolderWorkspace']
>[1]

/** Upstream folder workspaces followed by each local Workspace's folder projection. */
export function withLocalFolderWorkspaces(
  owner: LocalProjectsPersistence,
  folderWorkspaces: FolderWorkspace[]
): FolderWorkspace[] {
  return [...folderWorkspaces, ...projectLocalFolderWorkspaces(owner.getLocalProjectsSnapshot())]
}

/** A local Workspace's folder projection; undefined when `id` is not a local Workspace. */
export function getLocalFolderWorkspace(
  owner: LocalProjectsPersistence,
  id: string
): FolderWorkspace | undefined {
  const local = owner.getLocalProjectsSnapshot()
  const workspace = local.workspaces.find((entry) => entry.id === id)
  return workspace ? projectLocalFolderWorkspace(local, workspace) : undefined
}

/** Routes folder metadata updates to the local Workspace owner; undefined when `id` is not one. */
export function updateLocalFolderWorkspace(
  owner: LocalProjectsPersistence,
  id: string,
  updates: FolderWorkspaceUpdates
): FolderWorkspace | undefined {
  if (!owner.resolveLocalWorkspace(id)) {
    return undefined
  }
  const { pendingFirstAgentMessageRename, firstAgentMessageRenameError, ...metadata } = updates
  if (
    (pendingFirstAgentMessageRename !== undefined && pendingFirstAgentMessageRename !== false) ||
    (firstAgentMessageRenameError !== undefined && firstAgentMessageRenameError !== null)
  ) {
    throw new Error('Local Workspace names are managed explicitly.')
  }
  const workspace = owner.updateLocalWorkspace({ workspaceId: id, updates: metadata })
  return projectLocalFolderWorkspace(owner.getLocalProjectsSnapshot(), workspace)
}

/** Local Workspaces are archived, never deleted, so their saved context survives. */
export function refuseLocalWorkspaceRemoval(
  owner: { resolveLocalWorkspace?: (id: string) => unknown } | null | undefined,
  id: string
): void {
  if (owner?.resolveLocalWorkspace?.(id)) {
    throw new Error('Archive this local Workspace instead of deleting its saved context.')
  }
}
