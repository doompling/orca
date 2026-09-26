import type { FolderWorkspace } from '../folder-workspace-types'
import type { LocalProjectsState, LocalWorkspace } from './types'
import { resolveLocalWorkspace } from './workspace-resolution'

export function projectLocalFolderWorkspace(
  state: LocalProjectsState,
  workspace: LocalWorkspace
): FolderWorkspace {
  const resolved = resolveLocalWorkspace(state, workspace.id)
  const root = resolved?.roots.find((entry) => entry.id === resolved.defaultRootId)
  if (!root) {
    throw new Error('Local Workspace default root is unavailable.')
  }
  return {
    id: workspace.id,
    projectGroupId: workspace.projectId,
    name: workspace.name,
    folderPath: root.path,
    connectionId: null,
    executionHostId: 'local',
    linkedTask: null,
    comment: '',
    isArchived:
      workspace.isArchived ||
      state.projects.some((project) => project.id === workspace.projectId && project.isArchived),
    isUnread: workspace.isUnread ?? false,
    isPinned: workspace.isPinned ?? false,
    sortOrder: workspace.createdAt,
    lastActivityAt: workspace.lastActivityAt ?? 0,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  }
}

export function projectLocalFolderWorkspaces(state: LocalProjectsState): FolderWorkspace[] {
  return state.workspaces.map((workspace) => projectLocalFolderWorkspace(state, workspace))
}
