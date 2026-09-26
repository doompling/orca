import { parseWorkspaceKey } from '../workspace-scope'
import type { LocalProjectsState, ResolvedLocalWorkspace } from './types'

export function emptyLocalProjectsState(): LocalProjectsState {
  return { version: 1, projects: [], workspaces: [] }
}

export function resolveLocalWorkspace(
  state: LocalProjectsState,
  workspaceId: string
): ResolvedLocalWorkspace | null {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId)
  const project = state.projects.find((entry) => entry.id === workspace?.projectId)
  if (!workspace || !project) {
    return null
  }
  return {
    workspaceId: workspace.id,
    projectId: project.id,
    roots: project.roots.map((root) => ({
      ...root,
      path: Object.hasOwn(workspace.checkoutOverridesByRootId, root.id)
        ? workspace.checkoutOverridesByRootId[root.id]
        : root.path
    })),
    defaultRootId: workspace.defaultRootId ?? project.defaultRootId
  }
}

export function resolveLocalWorkspaceKey(
  state: LocalProjectsState,
  workspaceKey: string
): ResolvedLocalWorkspace | null {
  const scope = parseWorkspaceKey(workspaceKey)
  return scope?.type === 'folder' ? resolveLocalWorkspace(state, scope.folderWorkspaceId) : null
}
