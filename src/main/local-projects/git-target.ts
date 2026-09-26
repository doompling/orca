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
import { resolveRegisteredWorktreePath } from '../ipc/registered-worktree-roots-cache'
import {
  getLocalRepoForRegisteredWorktree,
  getLocalGitOptionsForRepo
} from '../ipc/local-worktree-runtime-options'
import type { Repo } from '../../shared/repo-types'
import type { GitRuntimeOptions } from '../git/git-runtime-options'

export type LocalRootGitArgs = {
  worktreePath: string
  connectionId?: string
  localRoot?: LocalWorkspaceGitRoot
}

export async function resolveDesktopGitTarget(
  store: Store,
  args: LocalRootGitArgs
): Promise<{
  worktreePath: string
  gitOptions: GitRuntimeOptions
  repo?: Repo
}> {
  if (!args.localRoot) {
    const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
    const repo = getLocalRepoForRegisteredWorktree(store, args.worktreePath, worktreePath)
    return { worktreePath, repo, gitOptions: getLocalGitOptionsForRepo(store, repo) }
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
