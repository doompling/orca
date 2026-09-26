import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { Store } from '../persistence/loading-store/store'
import { resolveAuthorizedPath } from '../ipc/filesystem-auth'
import { gitExecFileSync } from '../git/runner'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const stores: Store[] = []
const directories: string[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-local-project-')))
  directories.push(directory)
  const appA = join(directory, 'app-a')
  const appB = join(directory, 'app-b')
  mkdirSync(appA)
  mkdirSync(appB)
  writeFileSync(join(appA, 'note.txt'), 'original')
  const dataFile = join(directory, 'profile.json')
  const store = new Store({ dataFile })
  stores.push(store)
  return {
    store,
    dataFile,
    appA,
    appB,
    input: {
      name: 'Application',
      roots: [
        { id: 'a', path: appA },
        { id: 'b', path: appB }
      ],
      defaultRootId: 'b'
    }
  }
}

describe('local Project persistence in the existing profile Store', () => {
  it('durably creates Project and Main together without a legacy record or filesystem mutation', async () => {
    const { store, dataFile, appA, appB, input } = fixture()
    const created = await store.createLocalProject(input)
    expect(created.workspace.name).toBe('Main')
    expect(created.project.lastWorkspaceId).toBe(created.workspace.id)
    expect(store.resolveLocalWorkspace(created.workspace.id)).toMatchObject({
      roots: [
        { id: 'a', path: appA },
        { id: 'b', path: appB }
      ],
      defaultRootId: 'b'
    })
    const saved = JSON.parse(readFileSync(dataFile, 'utf8'))
    expect(saved.localProjects.projects).toEqual([created.project])
    expect(saved.localProjects.workspaces).toEqual([created.workspace])
    expect(saved.folderWorkspaces).toEqual([])
    expect(saved.projectGroups).toEqual([])
    expect(store.getRepos()).toEqual([])
    expect(readFileSync(join(appA, 'note.txt'), 'utf8')).toBe('original')
    expect(store.getFolderWorkspace(created.workspace.id)?.folderPath).toBe(appB)
  })

  it('allows the same directories in independent Projects and Workspaces', async () => {
    const { store, input } = fixture()
    const first = await store.createLocalProject(input)
    const second = await store.createLocalProject(input)
    const task = await store.createLocalWorkspace({
      projectId: first.project.id,
      name: 'Investigate'
    })
    expect(new Set([first.workspace.id, second.workspace.id, task.id]).size).toBe(3)
    expect(store.getFolderWorkspaces()).toHaveLength(3)
    expect(store.resolveLocalWorkspace(task.id)?.roots).toEqual(first.project.roots)
    const snapshot = store.getLocalProjectsSnapshot()
    snapshot.projects[0].name = 'uncommitted'
    expect(store.getLocalProjectsSnapshot().projects[0].name).toBe('Application')
  })

  it('authorizes both exact local roots through the existing filesystem owner, not their parent', async () => {
    const { store, input, appA, appB } = fixture()
    await store.createLocalProject(input)
    await expect(resolveAuthorizedPath(join(appA, 'note.txt'), store)).resolves.toBe(
      join(appA, 'note.txt')
    )
    await expect(resolveAuthorizedPath(appB, store)).resolves.toBe(appB)
    const unrelated = join(appA, '..', 'unrelated')
    mkdirSync(unrelated)
    await expect(resolveAuthorizedPath(unrelated, store)).rejects.toThrow('Access denied')
    const escape = join(appA, 'escape')
    symlinkSync(unrelated, escape, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(resolveAuthorizedPath(escape, store)).rejects.toThrow('Access denied')
  })

  it('authorizes an explicitly selected existing checkout without changing another Workspace', async () => {
    const { store, input, appA, appB } = fixture()
    gitExecFileSync(['init'], { cwd: appA })
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
      { cwd: appA }
    )
    const alternate = join(appA, '..', 'alternate')
    gitExecFileSync(['worktree', 'add', '--detach', alternate, 'HEAD'], { cwd: appA })
    const { project, workspace } = await store.createLocalProject(input)
    const task = await store.createLocalWorkspace({
      projectId: project.id,
      name: 'Isolated A',
      checkoutOverridesByRootId: { a: alternate }
    })
    await expect(resolveAuthorizedPath(alternate, store)).resolves.toBe(realpathSync(alternate))
    expect(store.resolveLocalWorkspace(task.id)?.roots.map((root) => root.path)).toEqual([
      realpathSync(alternate),
      appB
    ])
    expect(store.resolveLocalWorkspace(workspace.id)?.roots[0].path).toBe(appA)
  })

  it('does not publish partial records when a directory is missing or duplicated', async () => {
    const { store, appA, input } = fixture()
    await expect(
      store.createLocalProject({
        ...input,
        roots: [{ path: appA }, { path: join(appA, 'missing') }]
      })
    ).rejects.toThrow()
    await expect(
      store.createLocalProject({
        ...input,
        roots: [{ path: appA }, { path: join(appA, '.') }]
      })
    ).rejects.toThrow('only be added once')
    expect(store.getLocalProjectsSnapshot().projects).toEqual([])
    expect(store.getFolderWorkspaces()).toEqual([])
  })

  it('rolls back both in-memory records when the existing durability barrier fails', async () => {
    const { store, input } = fixture()
    const flush = vi.spyOn(store, 'flushOrThrow').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    await expect(store.createLocalProject(input)).rejects.toThrow('disk full')
    expect(flush).toHaveBeenCalledOnce()
    expect(store.getLocalProjectsSnapshot()).toEqual({ version: 1, projects: [], workspaces: [] })
    expect(store.getFolderWorkspaces()).toEqual([])
  })

  it('rejects an invalid default, root override, or closing profile without changing state', async () => {
    const { store, input, appA } = fixture()
    await expect(store.createLocalProject({ ...input, defaultRootId: 'missing' })).rejects.toThrow()
    const { project } = await store.createLocalProject(input)
    await expect(
      store.createLocalWorkspace({
        projectId: project.id,
        name: 'Other',
        checkoutOverridesByRootId: { missing: appA }
      })
    ).rejects.toThrow('unknown Project root')
    store.freezeWrites()
    await expect(
      store.createLocalWorkspace({ projectId: project.id, name: 'Late' })
    ).rejects.toThrow('closing')
    expect(store.getLocalProjectsSnapshot().workspaces).toHaveLength(1)
  })

  it('persists existing folder session identity and reloads projections without a writable mirror', async () => {
    const { store, dataFile, input } = fixture()
    const { workspace } = await store.createLocalProject(input)
    const key = folderWorkspaceKey(workspace.id)
    store.setWorkspaceSession({
      ...store.getWorkspaceSession(),
      activeWorktreeId: key,
      activeWorkspaceKey: key,
      openFilesByWorktree: {
        [key]: [
          {
            filePath: join(input.roots[0].path, 'note.txt'),
            relativePath: 'note.txt',
            worktreeId: key,
            language: 'plaintext',
            dirtyDraftContent: 'retained draft'
          }
        ]
      }
    })
    store.flushOrThrow()
    store.freezeWrites()
    const reopened = new Store({ dataFile })
    stores.push(reopened)
    expect(reopened.getLocalProjectsSnapshot()).toEqual(store.getLocalProjectsSnapshot())
    expect(reopened.getFolderWorkspace(workspace.id)?.id).toBe(workspace.id)
    expect(reopened.getWorkspaceSession().activeWorkspaceKey).toBe(key)
    expect(reopened.getWorkspaceSession().openFilesByWorktree?.[key][0].dirtyDraftContent).toBe(
      'retained draft'
    )
  })

  it('routes name/archive metadata to one owner and refuses legacy deletion or path retargeting', async () => {
    const { store, input, appA } = fixture()
    const { project, workspace } = await store.createLocalProject(input)
    expect(
      store.updateFolderWorkspace(workspace.id, {
        name: 'Renamed',
        pendingFirstAgentMessageRename: false,
        firstAgentMessageRenameError: null
      })?.name
    ).toBe('Renamed')
    expect(store.getLocalProjectsSnapshot().workspaces[0]).not.toHaveProperty(
      'pendingFirstAgentMessageRename'
    )
    expect(() =>
      store.updateFolderWorkspace(workspace.id, { pendingFirstAgentMessageRename: true })
    ).toThrow('explicitly')
    expect(() =>
      store.updateFolderWorkspace(workspace.id, { firstAgentMessageRenameError: 'failed' })
    ).toThrow('explicitly')
    expect(() => store.updateFolderWorkspace(workspace.id, { folderPath: appA })).toThrow()
    expect(() => store.removeFolderWorkspace(workspace.id)).toThrow('Archive')
    store.updateLocalProject({ projectId: project.id, updates: { isArchived: true } })
    expect(store.getFolderWorkspace(workspace.id)?.isArchived).toBe(true)
    expect(store.resolveLocalWorkspace(workspace.id)?.roots).toHaveLength(2)
    expect(readFileSync(join(appA, 'note.txt'), 'utf8')).toBe('original')
    await expect(
      store.createLocalWorkspace({ projectId: project.id, name: 'New' })
    ).rejects.toThrow('active')
  })

  it('persists activity and attention in the canonical record without regressing delayed activity', async () => {
    const { store, input, dataFile } = fixture()
    const { workspace } = await store.createLocalProject(input)
    expect(store.getFolderWorkspace(workspace.id)).toMatchObject({
      isUnread: false,
      isPinned: false,
      lastActivityAt: 0
    })
    store.updateFolderWorkspace(workspace.id, {
      isUnread: true,
      isPinned: true,
      lastActivityAt: 20
    })
    const flush = vi.spyOn(store, 'flushOrThrow')
    store.updateFolderWorkspace(workspace.id, { lastActivityAt: 10 })
    expect(flush).not.toHaveBeenCalled()
    store.updateFolderWorkspace(workspace.id, { isUnread: false, lastActivityAt: 10 })
    expect(store.getFolderWorkspace(workspace.id)).toMatchObject({
      isUnread: false,
      isPinned: true,
      lastActivityAt: 20
    })
    for (const lastActivityAt of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => store.updateFolderWorkspace(workspace.id, { lastActivityAt })).toThrow()
    }
    store.freezeWrites()
    const reopened = new Store({ dataFile })
    stores.push(reopened)
    expect(reopened.getLocalProjectsSnapshot().workspaces[0]).toMatchObject({
      isUnread: false,
      isPinned: true,
      lastActivityAt: 20
    })
    expect(reopened.getFolderWorkspace(workspace.id)).toMatchObject({
      isUnread: false,
      isPinned: true,
      lastActivityAt: 20
    })
    expect(JSON.parse(readFileSync(dataFile, 'utf8')).folderWorkspaces).toEqual([])
  })
})
