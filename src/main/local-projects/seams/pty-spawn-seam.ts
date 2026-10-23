import type { Store } from '../../persistence'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { resolveTerminalStartupCwd } from '../../../shared/terminal-startup-cwd'
import { isWslShellName } from '../../../shared/local-windows-terminal-runtime'
import { assertLocalWorkspaceLaunchScopeOwner } from '../../../shared/local-projects/agent-launch-scope'
import { assertLegacyAgentEntrypointSupportsWorkspace } from '../../../shared/local-projects/agent-entrypoint'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatusForPath
} from '../../project-groups/folder-workspace-path-status'

export type FolderWorkspacePtyLaunchContext = {
  launchConfig?: SleepingAgentLaunchConfig
  connectionId?: string | null
  cwd?: string
  launchAgent?: string
  resumeProviderSession?: unknown
}

/**
 * The path check for a PTY that carries frozen local Workspace roots, or null to fall through to
 * upstream's folder check. Agent launches into a local Workspace that cannot carry its roots are
 * refused before falling through.
 */
export function localWorkspacePtyPathCheck(
  store: Store | undefined,
  worktreeId: string | undefined,
  launch: FolderWorkspacePtyLaunchContext | undefined
): Promise<void> | null {
  const scope = launch?.launchConfig?.localWorkspaceScope
  if (scope) {
    assertLocalWorkspaceLaunchScopeOwner(scope, worktreeId, launch.connectionId)
    if (launch.cwd !== scope.cwd) {
      throw new Error('The agent cwd does not match its saved Workspace roots.')
    }
    return Promise.all(
      [...new Set([...scope.roots.map((root) => root.path), scope.cwd])].map(async (path) => {
        const status = await getFolderWorkspacePathStatusForPath({
          folderPath: path,
          repos: [],
          projectGroups: []
        })
        assertFolderWorkspacePathUsable(status)
      })
    ).then(() => undefined)
  }
  const workspaceScope = typeof worktreeId === 'string' ? parseWorkspaceKey(worktreeId) : null
  if (
    store &&
    workspaceScope?.type === 'folder' &&
    (launch?.launchConfig || launch?.launchAgent || launch?.resumeProviderSession)
  ) {
    assertLegacyAgentEntrypointSupportsWorkspace(
      store.resolveLocalWorkspace?.(workspaceScope.folderWorkspaceId)
    )
  }
  return null
}

/** A local Workspace terminal starts in its default root; null for any other workspace. */
export function localWorkspacePtyStartupCwd(
  store: Partial<Pick<Store, 'resolveLocalWorkspace'>> | undefined,
  worktreeId: string | undefined,
  cwd: string | undefined
): string | null {
  const scope = worktreeId ? parseWorkspaceKey(worktreeId) : null
  const localWorkspace =
    scope?.type === 'folder' ? store?.resolveLocalWorkspace?.(scope.folderWorkspaceId) : null
  if (!localWorkspace) {
    return null
  }
  const root = localWorkspace.roots.find((entry) => entry.id === localWorkspace.defaultRootId)
  if (!root) {
    throw new Error('Local Workspace default root is unavailable.')
  }
  // A missing selected root must not silently launch in a different root.
  return resolveTerminalStartupCwd(root.path, cwd?.trim() ? cwd : '.')
}

/** Multi-root agents run in a native shell: a WSL shell cannot see the Workspace's roots. */
export function assertLocalWorkspacePtyShell(
  launch: Pick<FolderWorkspacePtyLaunchContext, 'launchConfig'>,
  shellOverride: string | undefined,
  preAdopted: boolean
): void {
  if (!preAdopted && launch.launchConfig?.localWorkspaceScope && isWslShellName(shellOverride)) {
    throw new Error('Multi-root Workspace agents require a native terminal shell, not WSL.')
  }
}
