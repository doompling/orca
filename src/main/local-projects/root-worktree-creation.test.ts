import { mkdirSync, mkdtempSync, existsSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../shared/local-projects/types'
import type * as RootValidation from './root-validation'
import { createLocalRootWorktree } from './root-worktree-creation'

const mocks = vi.hoisted(() => ({
  isGitRepo: vi.fn(() => true),
  getGitRepoRoot: vi.fn((path: string) => path),
  git: vi.fn(async () => ({ stdout: 'feature\n' })),
  head: vi.fn(async () => 'a'.repeat(40)),
  add: vi.fn(async () => ({})),
  describe: vi.fn(),
  validateOverrides: vi.fn(async () => ({}))
}))
vi.mock('../git/repo-detection', () => ({
  isGitRepo: mocks.isGitRepo,
  getGitRepoRoot: mocks.getGitRepoRoot
}))
vi.mock('../git/runner', () => ({
  gitExecFileAsync: mocks.git,
  awaitWindowsHostGitEnvironmentReady: vi.fn(async () => {})
}))
vi.mock('../git/worktree-add', () => ({ addWorktree: mocks.add }))
vi.mock('../git/worktree-base-ref-probe', () => ({ resolveWorktreeBaseCommitOid: mocks.head }))
vi.mock('../git/worktree-listing', () => ({ describeCreatedWorktree: mocks.describe }))
vi.mock('./root-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof RootValidation>()),
  resolveExistingCheckoutOverrides: mocks.validateOverrides
}))

const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
)
beforeEach(() => vi.clearAllMocks())

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-create-root-')))
  directories.push(directory)
  const source = join(directory, 'source')
  const shared = join(directory, 'shared')
  mkdirSync(source)
  mkdirSync(shared)
  const state: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [
          { id: 'root', label: 'App', path: source },
          { id: 'shared', label: 'Shared', path: shared }
        ],
        defaultRootId: 'root',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: []
  }
  const owner = { getLocalProjectsSnapshot: () => structuredClone(state) }
  const args = {
    projectId: 'project',
    rootId: 'root',
    expectedRootPath: source,
    path: join(directory, 'feature'),
    branchName: 'feature'
  }
  mocks.describe.mockResolvedValue({
    path: args.path,
    head: 'a'.repeat(40),
    branch: 'refs/heads/feature'
  })
  return { directory, source, shared, state, owner, args }
}

describe('explicit local Project root worktree creation', () => {
  it('uses the chosen Project checkout HEAD, leaves catalog and other roots unchanged', async () => {
    const { owner, args, source, state } = fixture()
    const before = structuredClone(state)
    const result = await createLocalRootWorktree(owner, args)
    expect(result).toEqual({
      projectId: 'project',
      rootId: 'root',
      path: args.path,
      branchName: 'feature',
      sourcePath: source,
      baseCommit: 'a'.repeat(40)
    })
    expect(mocks.head).toHaveBeenCalledWith(source, 'HEAD')
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      source,
      args.path,
      'feature',
      `${'a'.repeat(40)}^{commit}`,
      false,
      false,
      { admissionTier: 'interactive' }
    )
    expect(mocks.validateOverrides).toHaveBeenCalledWith(state.projects[0], { root: args.path })
    expect(state).toEqual(before)
  })

  it('refuses stale and archived sources before any Git effect', async () => {
    const { owner, args, state } = fixture()
    await expect(
      createLocalRootWorktree(owner, { ...args, expectedRootPath: '/changed' })
    ).rejects.toThrow('changed')
    state.projects[0].isArchived = true
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow('unavailable')
    expect(mocks.add).not.toHaveBeenCalled()
  })

  it('refuses a plain folder or selected Git subdirectory without creating files', async () => {
    const { owner, args, source } = fixture()
    mocks.isGitRepo.mockReturnValueOnce(false)
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow(
      'Plain folders remain shared'
    )
    mocks.getGitRepoRoot.mockReturnValueOnce(join(source, 'other'))
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow('Git checkout')
    expect(mocks.add).not.toHaveBeenCalled()
    expect(existsSync(args.path)).toBe(false)
  })

  it('never clobbers an existing directory or even a dangling symlink', async () => {
    const { directory, owner, args } = fixture()
    mkdirSync(args.path)
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow('already exists')
    const link = join(directory, 'dangling')
    symlinkSync(join(directory, 'missing'), link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(createLocalRootWorktree(owner, { ...args, path: link })).rejects.toThrow(
      'already exists'
    )
    expect(mocks.add).not.toHaveBeenCalled()
    expect(existsSync(args.path)).toBe(true)
  })

  it('refuses relative, WSL, missing-parent paths and branch option/revision spellings', async () => {
    const { owner, args, directory } = fixture()
    for (const path of [
      'relative',
      '\\\\wsl.localhost\\Ubuntu\\root',
      join(directory, 'absent', 'target')
    ]) {
      await expect(createLocalRootWorktree(owner, { ...args, path })).rejects.toThrow()
    }
    for (const branchName of ['-B', '@{-1}', 'topic..bad']) {
      await expect(createLocalRootWorktree(owner, { ...args, branchName })).rejects.toThrow()
    }
    expect(mocks.add).not.toHaveBeenCalled()
  })

  it('rechecks the root after async HEAD probing and refuses a changed source', async () => {
    const { owner, args, state } = fixture()
    mocks.head.mockImplementationOnce(async () => {
      state.projects[0].roots[0].path = '/changed'
      return 'a'.repeat(40)
    })
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow('changed')
    expect(mocks.add).not.toHaveBeenCalled()
  })

  it('retains a partially created checkout and provides exact recovery details on failure', async () => {
    const { owner, args } = fixture()
    mocks.add.mockImplementationOnce(async () => {
      mkdirSync(args.path)
      throw new Error('checkout failed')
    })
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow(
      `Nothing was removed. Check ${args.path} and branch feature`
    )
    expect(existsSync(args.path)).toBe(true)
    expect(mocks.describe).not.toHaveBeenCalled()
  })

  it('does not accept an unverified created target or silently use another path', async () => {
    const { owner, args } = fixture()
    mocks.describe.mockResolvedValueOnce({ path: '/other', head: 'a'.repeat(40) })
    await expect(createLocalRootWorktree(owner, args)).rejects.toThrow('could not verify')
    expect(mocks.validateOverrides).not.toHaveBeenCalled()
  })
})
