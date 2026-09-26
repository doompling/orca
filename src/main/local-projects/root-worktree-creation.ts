import { lstat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { LocalProjectsState } from '../../shared/local-projects/types'
import {
  CreateLocalRootWorktreeSchema,
  type CreateLocalRootWorktreeArgs,
  type CreateLocalRootWorktreeResult
} from '../../shared/local-projects/worktree-creation'
import { isWslUncPath } from '../../shared/wsl-paths'
import { getGitRepoRoot, isGitRepo } from '../git/repo-detection'
import { awaitWindowsHostGitEnvironmentReady, gitExecFileAsync } from '../git/runner'
import { addWorktree } from '../git/worktree-add'
import { resolveWorktreeBaseCommitOid } from '../git/worktree-base-ref-probe'
import { describeCreatedWorktree } from '../git/worktree-listing'
import { resolveExistingCheckoutOverrides, resolveExistingLocalDirectory } from './root-validation'

type SourceOwner = { getLocalProjectsSnapshot: () => LocalProjectsState }
const samePath = (left: string, right: string): boolean =>
  normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)

function readSource(owner: SourceOwner, args: CreateLocalRootWorktreeArgs) {
  const project = owner
    .getLocalProjectsSnapshot()
    .projects.find((entry) => entry.id === args.projectId && !entry.isArchived)
  const root = project?.roots.find((entry) => entry.id === args.rootId)
  if (!project || !root || !samePath(root.path, args.expectedRootPath)) {
    throw new Error(
      'The Project directory has changed or is unavailable. Reopen the Workspace form.'
    )
  }
  return { project, root }
}

async function assertAbsent(path: string): Promise<void> {
  try {
    await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(
    'The worktree destination already exists. Choose a new directory or select an existing worktree.'
  )
}

async function resolveDestination(path: string): Promise<string> {
  if (!isAbsolute(path) || isWslUncPath(path)) {
    throw new Error(
      'Choose an absolute local worktree path; remote and WSL paths are not supported.'
    )
  }
  const parent = await resolveExistingLocalDirectory(dirname(path))
  const target = join(parent, basename(path))
  await assertAbsent(target)
  return target
}

export async function createLocalRootWorktree(
  owner: SourceOwner,
  input: CreateLocalRootWorktreeArgs
): Promise<CreateLocalRootWorktreeResult> {
  const args = CreateLocalRootWorktreeSchema.parse(input)
  const { root } = readSource(owner, args)
  const sourcePath = await resolveExistingLocalDirectory(root.path)
  if (!samePath(sourcePath, root.path)) {
    throw new Error(
      'The Project directory has moved or become a symbolic link. Reopen the Workspace form.'
    )
  }
  await awaitWindowsHostGitEnvironmentReady({ cwd: sourcePath })
  if (!isGitRepo(sourcePath) || !samePath(getGitRepoRoot(sourcePath), sourcePath)) {
    throw new Error(
      'Create worktree requires a Project root that is a Git checkout. Plain folders remain shared.'
    )
  }
  await gitExecFileAsync(['check-ref-format', '--branch', args.branchName], { cwd: sourcePath })
  const baseCommit = await resolveWorktreeBaseCommitOid(sourcePath, 'HEAD')
  if (!baseCommit || !/^[a-f\d]{40,64}$/i.test(baseCommit)) {
    throw new Error(
      'The Project checkout must have a readable committed HEAD before creating a worktree.'
    )
  }
  const path = await resolveDestination(args.path)
  readSource(owner, args)
  // Recheck after asynchronous probes; Git itself owns branch/path collision admission.
  await assertAbsent(path)
  readSource(owner, args)
  try {
    await addWorktree(sourcePath, path, args.branchName, `${baseCommit}^{commit}`, false, false, {
      admissionTier: 'interactive'
    })
    const created = await describeCreatedWorktree(sourcePath, path, args.branchName)
    if (
      !created ||
      !samePath(created.path, path) ||
      created.head !== baseCommit ||
      created.branch !== `refs/heads/${args.branchName}`
    ) {
      throw new Error('Git could not verify the new worktree path, branch, and starting commit.')
    }
    await resolveExistingCheckoutOverrides(readSource(owner, args).project, { [args.rootId]: path })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Worktree creation did not finish verification: ${detail}\nNothing was removed. Check ${path} and branch ${args.branchName}; if the worktree exists, select it as an existing worktree.`,
      { cause: error }
    )
  }
  return {
    projectId: args.projectId,
    rootId: args.rootId,
    sourcePath,
    path,
    branchName: args.branchName,
    baseCommit
  }
}
