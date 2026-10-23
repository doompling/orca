import { resolveLocalWorkspaceKey } from '../../../../../shared/local-projects/workspace-resolution'
import { assertLegacyAgentEntrypointSupportsWorkspace } from '../../../../../shared/local-projects/agent-entrypoint'
import type { LocalProjectsState } from '../../../../../shared/local-projects/types'
import type { SleepingAgentLaunchConfig } from '../../../../../shared/agent-session-resume'
import { assertLocalWorkspaceLaunchScopeOwner } from '../../../../../shared/local-projects/agent-launch-scope'

/** Launch paths that cannot carry every Workspace root refuse a local multi-root Workspace. */
export function refuseLocalWorkspaceLegacyAgentLaunch(
  state: { localProjects?: LocalProjectsState },
  worktreeId: string
): void {
  assertLegacyAgentEntrypointSupportsWorkspace(
    state.localProjects && resolveLocalWorkspaceKey(state.localProjects, worktreeId)
  )
}

/**
 * Whether a resume may proceed: a local Workspace resume needs the roots frozen at launch (and
 * they must belong to this Workspace); any other workspace always may.
 */
export function localWorkspaceResumeHasRoots(
  state: { localProjects?: LocalProjectsState },
  worktreeId: string,
  launchConfig: SleepingAgentLaunchConfig | undefined,
  connectionId: string | null | undefined
): boolean {
  const scope = launchConfig?.localWorkspaceScope
  if (scope) {
    assertLocalWorkspaceLaunchScopeOwner(scope, worktreeId, connectionId)
    return true
  }
  return !(state.localProjects && resolveLocalWorkspaceKey(state.localProjects, worktreeId))
}

/** The cwd a PTY spawns in: a launch carrying frozen Workspace roots starts in their cwd, after
 *  checking they belong to this Workspace; anything else keeps `cwd`. */
export function localWorkspacePtySpawnCwd(
  launchConfig: SleepingAgentLaunchConfig | undefined,
  worktreeId: string | undefined,
  connectionId: string | null | undefined,
  cwd: string | undefined
): string | undefined {
  const scope = launchConfig?.localWorkspaceScope
  if (!scope) {
    return cwd
  }
  assertLocalWorkspaceLaunchScopeOwner(scope, worktreeId, connectionId)
  return scope.cwd
}
