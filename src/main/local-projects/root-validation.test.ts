import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalProject } from '../../shared/local-projects/types'
import { gitExecFileSync } from '../git/runner'
import {
  assertDistinctLocalDirectories,
  resolveExistingCheckoutOverrides,
  resolveExistingLocalDirectory
} from './root-validation'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getVersion: () => '0.0.0-test', isPackaged: false }
}))

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-local-root-')))
  directories.push(directory)
  const root = join(directory, 'source')
  mkdirSync(root)
  const project: LocalProject = {
    id: 'project',
    name: 'Application',
    roots: [{ id: 'root', label: 'Root', path: root }],
    defaultRootId: 'root',
    isArchived: false,
    createdAt: 1,
    updatedAt: 1
  }
  return { directory, root, project }
}

function initializeRepo(path: string): void {
  gitExecFileSync(['init'], { cwd: path })
  gitExecFileSync(
    [
      '-c',
      'user.name=Local test',
      '-c',
      'user.email=local@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '-m',
      'Initial'
    ],
    { cwd: path }
  )
}

describe('local Project directory admission', () => {
  it('resolves a native existing directory without requiring Git', async () => {
    const { root } = fixture()
    expect(await resolveExistingLocalDirectory(join(root, '.'))).toBe(root)
  })

  it('rejects files, relative paths, and explicit WSL paths', async () => {
    const { root } = fixture()
    const file = join(root, 'file.txt')
    writeFileSync(file, 'text')
    await expect(resolveExistingLocalDirectory(file)).rejects.toThrow('Not a directory')
    await expect(resolveExistingLocalDirectory('relative')).rejects.toThrow('local directory')
    await expect(
      resolveExistingLocalDirectory('\\\\wsl.localhost\\Ubuntu\\home\\repo')
    ).rejects.toThrow('WSL')
  })

  it('detects two aliases of the same directory within one Project', async () => {
    const { directory, root } = fixture()
    const alias = join(directory, 'alias')
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const paths = await Promise.all([root, alias].map(resolveExistingLocalDirectory))
    expect(() => assertDistinctLocalDirectories(paths)).toThrow('only be added once')
  })

  it('accepts only an already-existing worktree of the root repository', async () => {
    const { directory, root, project } = fixture()
    initializeRepo(root)
    const alternate = join(directory, 'alternate')
    gitExecFileSync(['worktree', 'add', '--detach', alternate, 'HEAD'], { cwd: root })
    await expect(resolveExistingCheckoutOverrides(project, { root: alternate })).resolves.toEqual({
      root: alternate
    })
    const unrelated = join(directory, 'unrelated')
    mkdirSync(unrelated)
    initializeRepo(unrelated)
    await expect(resolveExistingCheckoutOverrides(project, { root: unrelated })).rejects.toThrow(
      'same repository'
    )
  })

  it('does not expand a selected subdirectory into an entire alternate checkout', async () => {
    const { directory, root, project } = fixture()
    initializeRepo(root)
    const nested = join(root, 'selected')
    mkdirSync(nested)
    project.roots[0].path = nested
    const alternate = join(directory, 'alternate')
    gitExecFileSync(['worktree', 'add', '--detach', alternate, 'HEAD'], { cwd: root })
    await expect(resolveExistingCheckoutOverrides(project, { root: alternate })).rejects.toThrow(
      'same repository'
    )
  })
})
