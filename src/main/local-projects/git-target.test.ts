import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence/loading-store/store'
import { openLocalProjectsTestStore } from './local-projects-store.test-support'
import { gitExecFileSync } from '../git/runner'
import { resolveLocalRootGitTarget } from './git-target'
import { createFilesystemHandlerContext } from '../ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../ipc/sender-scoped-request-cancellation'
import { registerFilesystemGitStatusHandlers } from '../ipc/filesystem/filesystem-git-status-handlers'
import { registerFilesystemGitIndexHandlers } from '../ipc/filesystem/filesystem-git-index-handlers'
import { registerFilesystemGitCommitHandlers } from '../ipc/filesystem/filesystem-git-commit-handlers'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args: unknown) => Promise<unknown>>()
}))
vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'test',
    getVersion: () => '0.0.0',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: {
    on: () => {},
    handle: (channel: string, handler: (event: unknown, args: unknown) => Promise<unknown>) =>
      handlers.set(channel, handler)
  },
  BrowserWindow: { getAllWindows: () => [] }
}))
const stores: Store[] = []
const directories: string[] = []
afterEach(() => {
  stores.splice(0).forEach((store) => store.freezeWrites())
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  handlers.clear()
})

async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-root-git-')))
  directories.push(directory)
  const paths = ['a', 'b', 'plain'].map((name) => join(directory, name))
  for (const path of paths) {
    mkdirSync(path)
  }
  for (const path of paths.slice(0, 2)) {
    gitExecFileSync(['init'], { cwd: path })
    gitExecFileSync(['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: path })
    gitExecFileSync(['config', 'user.name', 'Local test'], { cwd: path })
    gitExecFileSync(['config', 'user.email', 'local@example.test'], { cwd: path })
    gitExecFileSync(['config', 'commit.gpgsign', 'false'], { cwd: path })
    writeFileSync(join(path, 'same.txt'), 'original\n')
    gitExecFileSync(['add', 'same.txt'], { cwd: path })
    gitExecFileSync(['commit', '-m', 'Initial'], { cwd: path })
    writeFileSync(join(path, 'same.txt'), `changed in ${path}\n`)
  }
  const store = openLocalProjectsTestStore(directory)
  stores.push(store)
  const { workspace } = await store.createLocalProject({
    name: 'Both',
    roots: paths.map((path, index) => ({ id: String(index), path }))
  })
  const context = createFilesystemHandlerContext(
    store,
    undefined,
    createSenderScopedRequestCancellations(),
    createSenderScopedRequestCancellations()
  )
  registerFilesystemGitStatusHandlers(context)
  registerFilesystemGitIndexHandlers(context)
  registerFilesystemGitCommitHandlers(context)
  return {
    store,
    paths,
    workspace,
    target: (index: number) => ({
      worktreePath: paths[index],
      localRoot: { workspaceId: workspace.id, rootId: String(index) }
    })
  }
}

function invoke(channel: string, args: unknown) {
  const handler = handlers.get(`git:${channel}`)
  if (!handler) {
    throw new Error(`Missing ${channel}`)
  }
  return handler({}, args)
}

describe('native Workspace root Git admission and existing IPC operations', () => {
  it('reads, diffs, stages, unstages and commits only the selected unregistered checkout', async () => {
    const { store, paths, target } = await fixture()
    await expect(invoke('status', target(0))).resolves.toMatchObject({
      branch: 'refs/heads/main',
      entries: [expect.objectContaining({ path: 'same.txt', area: 'unstaged' })]
    })
    await expect(
      invoke('diff', { ...target(0), filePath: 'same.txt', staged: false })
    ).resolves.toMatchObject({
      originalContent: 'original\n',
      modifiedContent: readFileSync(join(paths[0], 'same.txt'), 'utf8')
    })
    await invoke('stage', { ...target(0), filePath: 'same.txt' })
    await expect(invoke('status', target(0))).resolves.toMatchObject({
      entries: [expect.objectContaining({ area: 'staged' })]
    })
    await invoke('unstage', { ...target(0), filePath: 'same.txt' })
    await expect(invoke('status', target(0))).resolves.toMatchObject({
      entries: [expect.objectContaining({ area: 'unstaged' })]
    })
    await invoke('stage', { ...target(0), filePath: 'same.txt' })
    await expect(invoke('commit', { ...target(0), message: 'Only A' })).resolves.toMatchObject({
      success: true
    })
    await expect(invoke('status', target(0))).resolves.toMatchObject({ entries: [] })
    await expect(invoke('status', target(1))).resolves.toMatchObject({
      entries: [expect.objectContaining({ area: 'unstaged' })]
    })
    expect(store.getRepos()).toEqual([])
    expect(store.getProjectGroups()).toEqual([])
  })

  it('refuses plain roots, forged paths/roots, traversal and remote substitution', async () => {
    const { store, paths, target } = await fixture()
    await expect(invoke('status', target(2))).rejects.toThrow('not a Git checkout')
    await expect(invoke('status', { ...target(0), worktreePath: paths[1] })).rejects.toThrow(
      'changed'
    )
    await expect(invoke('stage', { ...target(0), filePath: '../b/same.txt' })).rejects.toThrow()
    await expect(invoke('status', { ...target(0), connectionId: 'remote' })).rejects.toThrow(
      'remote connection'
    )
    await expect(
      invoke('commit', { ...target(0), connectionId: 'remote', message: 'No' })
    ).rejects.toThrow('remote connection')
    await expect(
      resolveLocalRootGitTarget(store, {
        ...target(0),
        localRoot: { workspaceId: 'missing', rootId: '0' }
      })
    ).rejects.toThrow('unavailable')
  })

  it('refuses implicit expansion from a selected subdirectory to its containing checkout', async () => {
    const { store, paths } = await fixture()
    const subdirectory = join(paths[0], 'subdirectory')
    mkdirSync(subdirectory)
    const { workspace } = await store.createLocalProject({
      name: 'Subset',
      roots: [{ id: 'sub', path: subdirectory }]
    })
    await expect(
      resolveLocalRootGitTarget(store, {
        worktreePath: subdirectory,
        localRoot: { workspaceId: workspace.id, rootId: 'sub' }
      })
    ).rejects.toThrow('Select the checkout root')
  })

  it('does not inherit same-path registered Repo execution settings', async () => {
    const { store, target, paths } = await fixture()
    const lookup = vi.spyOn(store, 'getRepos').mockImplementation(() => {
      throw new Error('Legacy owner must not be consulted')
    })
    await expect(resolveLocalRootGitTarget(store, target(1))).resolves.toEqual({
      worktreePath: paths[1],
      gitOptions: {}
    })
    expect(lookup).not.toHaveBeenCalled()
    lookup.mockRestore()
  })
})

describe('resolveLocalRootGitTarget without a local root', () => {
  it('leaves the request to the caller’s upstream resolution', async () => {
    const { store } = await fixture()
    await expect(resolveLocalRootGitTarget(store, { worktreePath: '/repo' })).resolves.toBeNull()
  })
})
