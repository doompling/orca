import type { Store } from '../persistence'
import type { LocalWorkspaceGitRoot } from '../../shared/local-projects/git-root'
import {
  LocalWorkspaceGitRootSchema,
  LOCAL_ROOT_GIT_UNAVAILABLE,
  LOCAL_ROOT_GIT_SUBDIRECTORY
} from '../../shared/local-projects/git-root'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { resolveExistingLocalDirectory } from './root-validation'
import { getGitRepoRoot, isGitRepo } from '../git/repo-detection'
import { awaitWindowsHostGitEnvironmentReady } from '../git/runner'
import type { GitRuntimeOptions } from '../git/git-runtime-options'

export type LocalRootGitArgs = {
  worktreePath: string
  connectionId?: string
  localRoot?: LocalWorkspaceGitRoot
}

/**
 * The Git target for a request naming a local Workspace root, or null for any other request so the
 * caller's upstream resolution (registered worktree, reachable route, repo options) runs unchanged.
 */
export async function resolveLocalRootGitTarget(
  store: Store,
  args: LocalRootGitArgs
): Promise<{ worktreePath: string; gitOptions: GitRuntimeOptions } | null> {
  if (!args.localRoot) {
    return null
  }
  if (args.connectionId) {
    throw new Error('Local Workspace Git cannot use a remote connection.')
  }
  const selection = LocalWorkspaceGitRootSchema.parse(args.localRoot)
  const workspace = store.resolveLocalWorkspace(selection.workspaceId)
  const root = workspace?.roots.find((entry) => entry.id === selection.rootId)
  if (
    !root ||
    normalizeRuntimePathForComparison(root.path) !==
      normalizeRuntimePathForComparison(args.worktreePath)
  ) {
    throw new Error('The selected Workspace Git root is unavailable or has changed.')
  }
  const worktreePath = await resolveExistingLocalDirectory(root.path)
  if (
    normalizeRuntimePathForComparison(worktreePath) !== normalizeRuntimePathForComparison(root.path)
  ) {
    throw new Error('The selected Workspace Git root has moved or become a symbolic link.')
  }
  await awaitWindowsHostGitEnvironmentReady({ cwd: worktreePath })
  if (!isGitRepo(worktreePath)) {
    throw new Error(LOCAL_ROOT_GIT_UNAVAILABLE)
  }
  if (
    normalizeRuntimePathForComparison(getGitRepoRoot(worktreePath)) !==
    normalizeRuntimePathForComparison(worktreePath)
  ) {
    throw new Error(LOCAL_ROOT_GIT_SUBDIRECTORY)
  }
  return { worktreePath, gitOptions: {} }
}
