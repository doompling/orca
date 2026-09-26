import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { isWslUncPath } from '../../shared/wsl-paths'
import type { LocalProject } from '../../shared/local-projects/types'
import { getGitRepoRoot, getLinkedWorktreeMainRepoRoot, isGitRepo } from '../git/repo-detection'
import { awaitWindowsHostGitEnvironmentReady } from '../git/runner'

export async function resolveExistingLocalDirectory(path: string): Promise<string> {
  if (!isAbsolute(path) || isWslUncPath(path)) {
    throw new Error('Choose an existing local directory; remote and WSL roots are not supported.')
  }
  const resolved = await realpath(path)
  if (isWslUncPath(resolved)) {
    throw new Error('WSL roots are not supported by local Projects.')
  }
  if (!(await stat(resolved)).isDirectory()) {
    throw new Error(`Not a directory: ${path}`)
  }
  return resolved
}

export function assertDistinctLocalDirectories(paths: readonly string[]): void {
  const keys = new Set(paths.map(normalizeRuntimePathForComparison))
  if (keys.size !== paths.length) {
    throw new Error('A directory can only be added once to the same Project.')
  }
}

export async function resolveExistingCheckoutOverrides(
  project: LocalProject,
  overrides: Record<string, string>
): Promise<Record<string, string>> {
  const resolved = new Map<string, string>()
  for (const [rootId, path] of Object.entries(overrides)) {
    const root = project.roots.find((entry) => entry.id === rootId)
    if (!root) {
      throw new Error('Workspace checkout refers to an unknown Project root.')
    }
    const target = await resolveExistingLocalDirectory(path)
    await awaitWindowsHostGitEnvironmentReady({ cwd: target })
    if (!isGitRepo(root.path) || !isGitRepo(target)) {
      throw new Error('Checkout overrides must select an existing worktree of the same repository.')
    }
    const sourceRoot = getGitRepoRoot(root.path)
    const targetRoot = getGitRepoRoot(target)
    const sourceMain = getLinkedWorktreeMainRepoRoot(sourceRoot) ?? sourceRoot
    const targetMain = getLinkedWorktreeMainRepoRoot(targetRoot) ?? targetRoot
    const [sourceIdentity, targetIdentity] = await Promise.all([
      realpath(sourceMain),
      realpath(targetMain)
    ])
    if (
      normalizeRuntimePathForComparison(sourceRoot) !==
        normalizeRuntimePathForComparison(root.path) ||
      normalizeRuntimePathForComparison(targetRoot) !== normalizeRuntimePathForComparison(target) ||
      normalizeRuntimePathForComparison(sourceIdentity) !==
        normalizeRuntimePathForComparison(targetIdentity)
    ) {
      throw new Error('Checkout overrides must select an existing worktree of the same repository.')
    }
    resolved.set(rootId, target)
  }
  return Object.fromEntries(resolved)
}
