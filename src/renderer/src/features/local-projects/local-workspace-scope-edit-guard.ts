import type { AppState } from '@/store/types'
import { tabHasLivePty } from '@/lib/tab-has-live-pty'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

type ScopeEditState = Pick<
  AppState,
  | 'localProjects'
  | 'openFiles'
  | 'editorDrafts'
  | 'workspaceSessionReady'
  | 'hydrationSucceeded'
  | 'terminalStartupRestorationReady'
  | 'tabsByWorktree'
  | 'ptyIdsByTabId'
  | 'pendingStartupByTabId'
  | 'pendingReconnectPtyIdByTabId'
>

export function assertLocalWorkspaceScopeEditAllowed(
  state: ScopeEditState,
  workspaceIds: readonly string[]
): void {
  if (
    !state.workspaceSessionReady ||
    !state.hydrationSucceeded ||
    !state.terminalStartupRestorationReady
  ) {
    throw new Error(
      'Wait for saved files and sessions to finish restoring before changing directories.'
    )
  }
  for (const workspaceId of workspaceIds) {
    const key = folderWorkspaceKey(workspaceId)
    const workspace = state.localProjects.workspaces.find((entry) => entry.id === workspaceId)
    const label = workspace?.name ?? 'this Workspace'
    const dirty = state.openFiles.some(
      (file) =>
        file.worktreeId === key &&
        !file.runtimeEnvironmentId &&
        !file.externalSshTargetId &&
        !file.readOnly &&
        (file.isDirty || state.editorDrafts[file.id] !== undefined)
    )
    if (dirty) {
      throw new Error(
        `Save or discard unsaved edits in ${label} before changing directories. Nothing was changed.`
      )
    }
    const running = (state.tabsByWorktree[key] ?? []).some(
      (tab) =>
        tabHasLivePty(state.ptyIdsByTabId, tab.id) ||
        state.pendingStartupByTabId[tab.id] !== undefined ||
        state.pendingReconnectPtyIdByTabId[tab.id] !== undefined
    )
    if (running) {
      throw new Error(
        `Close running or reconnecting terminals and agents in ${label} before changing directories. Nothing was stopped.`
      )
    }
  }
}
