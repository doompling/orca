import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../shared/local-projects/types'
import { gitExecFileSync } from '../git/runner'
import { createLocalRootWorktree } from './root-worktree-creation'
import { resolveExistingCheckoutOverrides } from './root-validation'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getVersion: () => '0.0.0-test', isPackaged: false }
}))
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
function git(cwd: string, args: string[]): string {
  return gitExecFileSync(args, { cwd }).trim()
}
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-new-worktree-')))
  directories.push(directory)
  const source = join(directory, 'source')
  const shared = join(directory, 'shared')
  mkdirSync(source)
  mkdirSync(shared)
  git(source, ['init'])
  git(source, ['config', 'user.name', 'Local worktree test'])
  git(source, ['config', 'user.email', 'local@example.test'])
  git(source, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(source, 'note.txt'), 'committed\n')
  git(source, ['add', 'note.txt'])
  git(source, ['commit', '-m', 'Initial'])
  const state: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [
          { id: 'a', label: 'A', path: source },
          { id: 'b', label: 'B', path: shared }
        ],
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: []
  }
  return {
    directory,
    source,
    shared,
    state,
    owner: { getLocalProjectsSnapshot: () => structuredClone(state) },
    args: {
      projectId: 'project',
      rootId: 'a',
      expectedRootPath: source,
      path: join(directory, 'new-checkout'),
      branchName: 'feature-ui'
    }
  }
}

describe('local root worktree creation against real Git', () => {
  it('creates from the Project HEAD, not an alternate, with other files/index/branch unchanged', async () => {
    const { owner, args, source, shared, state, directory } = fixture()
    const alternate = join(directory, 'existing-alternate')
    git(source, ['worktree', 'add', '-b', 'other-head', alternate])
    git(alternate, ['commit', '--allow-empty', '-m', 'Different alternate HEAD'])
    state.workspaces.push({
      id: 'workspace',
      projectId: 'project',
      name: 'Alternate',
      checkoutOverridesByRootId: { a: alternate },
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    })
    const before = structuredClone(state)
    const sourceHead = git(source, ['rev-parse', 'HEAD'])
    const sourceBranch = git(source, ['symbolic-ref', '--short', 'HEAD'])
    const sourceIndex = git(source, ['ls-files', '--stage'])
    writeFileSync(join(source, 'note.txt'), 'uncommitted edit\n')
    writeFileSync(join(shared, 'shared.txt'), 'shared unchanged\n')
    const result = await createLocalRootWorktree(owner, args)
    expect(result.baseCommit).toBe(sourceHead)
    expect(git(result.path, ['rev-parse', 'HEAD'])).toBe(sourceHead)
    expect(git(result.path, ['rev-parse', 'HEAD'])).not.toBe(git(alternate, ['rev-parse', 'HEAD']))
    expect(git(result.path, ['symbolic-ref', '--short', 'HEAD'])).toBe('feature-ui')
    expect(readFileSync(join(result.path, 'note.txt'), 'utf8')).toBe('committed\n')
    expect(git(source, ['symbolic-ref', '--short', 'HEAD'])).toBe(sourceBranch)
    expect(git(source, ['ls-files', '--stage'])).toBe(sourceIndex)
    expect(readFileSync(join(source, 'note.txt'), 'utf8')).toBe('uncommitted edit\n')
    expect(readFileSync(join(shared, 'shared.txt'), 'utf8')).toBe('shared unchanged\n')
    expect(state).toEqual(before)
    await expect(
      resolveExistingCheckoutOverrides(state.projects[0], { a: result.path })
    ).resolves.toEqual({ a: result.path })
  })

  it('does not overwrite existing paths or branches, and refuses plain-folder creation', async () => {
    const { owner, args, source, shared } = fixture()
    const head = git(source, ['rev-parse', 'HEAD'])
    const branch = git(source, ['symbolic-ref', '--short', 'HEAD'])
    await expect(createLocalRootWorktree(owner, { ...args, path: shared })).rejects.toThrow(
      'already exists'
    )
    await expect(createLocalRootWorktree(owner, { ...args, branchName: branch })).rejects.toThrow(
      'Nothing was removed'
    )
    expect(existsSync(args.path)).toBe(false)
    expect(git(source, ['rev-parse', 'HEAD'])).toBe(head)
    await expect(
      createLocalRootWorktree(owner, { ...args, rootId: 'b', expectedRootPath: shared })
    ).rejects.toThrow('Plain folders remain shared')
    expect(existsSync(args.path)).toBe(false)
  })
})
