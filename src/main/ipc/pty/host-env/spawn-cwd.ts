import { statSync } from 'node:fs'
import type { Store } from '../../../persistence'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import {
  resolveTerminalStartupCwd,
  resolveTerminalStartupCwdForWorkspace,
  type TerminalStartupCwdMissingDirFallback
} from '../../../../shared/terminal-startup-cwd'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus,
  getFolderWorkspacePathStatusForPath
} from '../../../project-groups/folder-workspace-path-status'
import { getSshFilesystemProvider } from '../../../providers/ssh-filesystem-dispatch'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session-resume'
import { assertLocalWorkspaceLaunchScopeOwner } from '../../../../shared/local-projects/agent-launch-scope'
import { assertLegacyAgentEntrypointSupportsWorkspace } from '../../../../shared/local-projects/agent-entrypoint'

export type FolderWorkspacePtyLaunchContext = {
  launchConfig?: SleepingAgentLaunchConfig
  connectionId?: string | null
  cwd?: string
  launchAgent?: string
  resumeProviderSession?: unknown
}

export function assertFolderWorkspacePtyPathUsable(
  store: Store | undefined,
  worktreeId: string | undefined,
  launch?: FolderWorkspacePtyLaunchContext
): Promise<void> | void {
  const scope = launch?.launchConfig?.localWorkspaceScope
  if (scope) {
    assertLocalWorkspaceLaunchScopeOwner(scope, worktreeId, launch.connectionId)
    if (launch.cwd !== scope.cwd) {
      throw new Error('The agent cwd does not match its saved Workspace roots.')
    }
    return Promise.all(
      [...new Set([...scope.roots.map((root) => root.path), scope.cwd])].map(async (path) => {
        const status = await getFolderWorkspacePathStatusForPath(
          { folderPath: path, repos: [], projectGroups: [] },
          { getSshFilesystemProvider }
        )
        assertFolderWorkspacePathUsable(status)
      })
    ).then(() => undefined)
  }
  const workspaceScope = typeof worktreeId === 'string' ? parseWorkspaceKey(worktreeId) : null
  if (!store || workspaceScope?.type !== 'folder') {
    return
  }
  if (launch?.launchConfig || launch?.launchAgent || launch?.resumeProviderSession) {
    assertLegacyAgentEntrypointSupportsWorkspace(
      store.resolveLocalWorkspace?.(workspaceScope.folderWorkspaceId)
    )
  }
  return getFolderWorkspacePathStatus(
    store,
    { scope: 'folder-workspace', folderWorkspaceId: workspaceScope.folderWorkspaceId },
    { getSshFilesystemProvider }
  ).then(assertFolderWorkspacePathUsable)
}

export function resolvePtySpawnStartupCwd(
  store:
    | (Pick<Store, 'getFolderWorkspace'> & Partial<Pick<Store, 'resolveLocalWorkspace'>>)
    | undefined,
  worktreeId: string | undefined,
  cwd: string | undefined,
  missingDirFallback?: TerminalStartupCwdMissingDirFallback
): string | undefined {
  const scope = worktreeId ? parseWorkspaceKey(worktreeId) : null
  const localWorkspace =
    scope?.type === 'folder' ? store?.resolveLocalWorkspace?.(scope.folderWorkspaceId) : null
  if (localWorkspace) {
    const root = localWorkspace.roots.find((entry) => entry.id === localWorkspace.defaultRootId)
    if (!root) {
      throw new Error('Local Workspace default root is unavailable.')
    }
    // A missing selected root must not silently launch in a different root.
    return resolveTerminalStartupCwd(root.path, cwd?.trim() ? cwd : '.')
  }
  return resolveTerminalStartupCwdForWorkspace({
    workspaceId: worktreeId,
    requestedCwd: cwd,
    missingDirFallback,
    resolveFolderWorkspacePath: (folderWorkspaceId) =>
      store?.getFolderWorkspace(folderWorkspaceId)?.folderPath
  })
}

export function localStartupCwdDirectoryExists(path: string): boolean {
  // Why: Win32 statSync on \\wsl.localhost 9P shares can falsely report ENOENT; defer to the provider's WSL-aware validation.
  if (isWslUncPath(path)) {
    return true
  }
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
