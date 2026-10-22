import type { AppState } from '@/store/types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { projectLocalFolderWorkspace } from '../../../../shared/local-projects/folder-projection'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import { folderWorkspaceKey, parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { localWorkspaceMarkSlots } from './local-sidebar-model'

export function localWorkspaceNavigationRows(catalog: LocalProjectsState | undefined) {
  return (catalog?.projects ?? [])
    .filter((project) => !project.isArchived)
    .flatMap(
      (project) =>
        catalog?.workspaces
          .filter((workspace) => workspace.projectId === project.id && !workspace.isArchived)
          .map((workspace) => ({ project, workspace })) ?? []
    )
}

export function localWorkspacePaletteRows(catalog: LocalProjectsState | undefined) {
  if (!catalog) {
    return []
  }
  return localWorkspaceNavigationRows(catalog).map(({ project, workspace }) => ({
    ...folderWorkspaceToWorktree(projectLocalFolderWorkspace(catalog, workspace)),
    displayName: `${project.name} / ${workspace.name}`,
    localLinearIssues: workspace.linearIssues ?? []
  }))
}

/** Digit N opens mark slot N. Empty slots stay holes (sparse) so later digits never shift. */
export function localWorkspaceShortcutTargets(catalog: LocalProjectsState | undefined) {
  const targets: { id: string; executionHostId: 'local' }[] = []
  if (!catalog) {
    return targets
  }
  for (const { slot, workspace } of localWorkspaceMarkSlots(catalog)) {
    if (workspace) {
      targets[slot - 1] = { id: folderWorkspaceKey(workspace.id), executionHostId: 'local' }
    }
  }
  return targets
}

export async function rememberLocalWorkspaceNavigation(
  state: Pick<
    AppState,
    'localProjects' | 'activeWorktreeId' | 'activeWorkspaceExecutionHostId' | 'updateLocalProject'
  >,
  worktreeId: string
): Promise<void> {
  if (
    state.activeWorktreeId !== worktreeId ||
    (state.activeWorkspaceExecutionHostId && state.activeWorkspaceExecutionHostId !== 'local')
  ) {
    return
  }
  const key = parseWorkspaceKey(worktreeId)
  if (key?.type !== 'folder') {
    return
  }
  const workspace = state.localProjects?.workspaces.find(
    (entry) => entry.id === key.folderWorkspaceId
  )
  const project = state.localProjects?.projects.find((entry) => entry.id === workspace?.projectId)
  if (
    !workspace ||
    workspace.isArchived ||
    !project ||
    project.isArchived ||
    project.lastWorkspaceId === workspace.id
  ) {
    return
  }
  await state.updateLocalProject({
    projectId: project.id,
    updates: { lastWorkspaceId: workspace.id }
  })
}
