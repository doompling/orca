import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence/loading-store/store'
import {
  openLocalProjectsTestStore,
  readSavedProfileDomain
} from './local-projects-store.test-support'
import { gitExecFileSync } from '../git/runner'
import {
  localProjectRootScope,
  localWorkspaceCheckoutScope
} from '../../shared/local-projects/scope-update'
import type { LocalWorkspaceScopeMutationGuard } from './scope-persistence'
import { folderWorkspaceKey } from '../../shared/workspace-scope'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => 'test',
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
const idle: LocalWorkspaceScopeMutationGuard = async (_ids, operation) => operation(async () => {})
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})
async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-root-edit-')))
  directories.push(directory)
  const roots = ['a', 'b', 'c'].map((id) => ({
    id,
    label: id.toUpperCase(),
    path: join(directory, id)
  }))
  roots.forEach((root) => mkdirSync(root.path))
  const profileDir = directory
  const store = openLocalProjectsTestStore(profileDir)
  stores.push(store)
  const { project, workspace } = await store.createLocalProject({
    name: 'Application',
    roots: roots.slice(0, 2),
    defaultRootId: 'a'
  })
  const task = await store.createLocalWorkspace({
    projectId: project.id,
    name: 'Task',
    defaultRootId: 'b'
  })
  return { store, project, workspace, task, roots, directory, profileDir }
}
describe('guarded local Project root updates', () => {
  it('permits label and order edits without checking processes or touching unavailable roots', async () => {
    const { store, project, roots } = await fixture()
    rmSync(roots[0].path, { recursive: true })
    const guard = vi.fn(async () => {
      throw new Error('Metadata must not check execution.')
    })
    const snapshot = await store.updateLocalProjectRoots(
      {
        projectId: project.id,
        expected: localProjectRootScope(project),
        roots: project.roots.toReversed().map((root) => ({ ...root, label: `New ${root.label}` })),
        defaultRootId: 'a'
      },
      guard
    )
    expect(guard).not.toHaveBeenCalled()
    expect(snapshot.projects[0].roots.map((root) => root.id)).toEqual(['b', 'a'])
  })

  it('guards every affected Workspace and atomically retains current metadata', async () => {
    const { store, project, workspace, task, roots, profileDir } = await fixture()
    const check = vi.fn(async () => {})
    const guard: LocalWorkspaceScopeMutationGuard = async (ids, operation) => {
      expect(ids).toEqual([workspace.id, task.id])
      store.updateLocalWorkspace({
        workspaceId: task.id,
        updates: { name: 'Renamed while validating', lastActivityAt: 50 }
      })
      return operation(check)
    }
    const snapshot = await store.updateLocalProjectRoots(
      {
        projectId: project.id,
        expected: localProjectRootScope(project),
        roots,
        defaultRootId: 'c'
      },
      guard
    )
    expect(check).toHaveBeenCalledOnce()
    expect(snapshot.workspaces[1].name).toBe('Renamed while validating')
    expect(store.resolveLocalWorkspace(workspace.id)?.defaultRootId).toBe('c')
    expect(store.resolveLocalWorkspace(task.id)?.defaultRootId).toBe('b')
    expect(readSavedProfileDomain(profileDir, 'localProjects')).toEqual(snapshot)
  })

  it('refuses live work and stale edit snapshots without changing the profile', async () => {
    const { store, project, roots } = await fixture()
    const before = store.getLocalProjectsSnapshot()
    const request = {
      projectId: project.id,
      expected: localProjectRootScope(project),
      roots,
      defaultRootId: 'c'
    }
    await expect(
      store.updateLocalProjectRoots(request, async () => {
        throw new Error('live terminal')
      })
    ).rejects.toThrow('live terminal')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
    await expect(
      store.updateLocalProjectRoots(
        { ...request, expected: { ...request.expected, defaultRootId: 'b' } },
        idle
      )
    ).rejects.toThrow('changed while editing')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
  })

  it('refuses a concurrent new Workspace instead of committing under an incomplete guard', async () => {
    const { store, project, roots } = await fixture()
    const guard: LocalWorkspaceScopeMutationGuard = async (_ids, operation) => {
      await store.createLocalWorkspace({ projectId: project.id, name: 'Concurrent' })
      return operation(async () => {})
    }
    await expect(
      store.updateLocalProjectRoots(
        {
          projectId: project.id,
          expected: localProjectRootScope(project),
          roots,
          defaultRootId: 'a'
        },
        guard
      )
    ).rejects.toThrow('changed while editing')
    expect(store.getLocalProjectsSnapshot().projects[0]).toEqual(project)
  })

  it('preserves the previous durable state when validation or the existing flush barrier fails', async () => {
    const { store, project, roots } = await fixture()
    const before = store.getLocalProjectsSnapshot()
    const request = {
      projectId: project.id,
      expected: localProjectRootScope(project),
      roots,
      defaultRootId: 'c'
    }
    await expect(
      store.updateLocalProjectRoots(
        { ...request, roots: [...roots, { ...roots[0], id: 'duplicate' }] },
        idle
      )
    ).rejects.toThrow('only be added once')
    vi.spyOn(store, 'flushOrThrow').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    await expect(store.updateLocalProjectRoots(request, idle)).rejects.toThrow('disk full')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
  })

  it('validates existing checkout replacements and removes only obsolete bindings/defaults', async () => {
    const { store, project, task, roots, directory } = await fixture()
    gitExecFileSync(['init'], { cwd: roots[0].path })
    gitExecFileSync(
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'Initial'
      ],
      { cwd: roots[0].path }
    )
    const alternate = join(directory, 'alternate')
    gitExecFileSync(['worktree', 'add', '--detach', alternate, 'HEAD'], { cwd: roots[0].path })
    const request = {
      workspaceId: task.id,
      expected: localWorkspaceCheckoutScope(project, task),
      checkoutOverridesByRootId: { a: alternate },
      defaultRootId: 'a'
    }
    await store.updateLocalWorkspaceCheckouts(request, idle)
    expect(store.resolveLocalWorkspace(task.id)?.roots[0].path).toBe(realpathSync(alternate))
    const before = store.getLocalProjectsSnapshot()
    await expect(
      store.updateLocalWorkspaceCheckouts(
        {
          ...request,
          expected: localWorkspaceCheckoutScope(before.projects[0], before.workspaces[1]),
          checkoutOverridesByRootId: { a: roots[1].path }
        },
        idle
      )
    ).rejects.toThrow('same repository')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
    await store.updateLocalProjectRoots(
      {
        projectId: project.id,
        expected: localProjectRootScope(project),
        roots: [roots[1]],
        defaultRootId: 'b'
      },
      idle
    )
    const updated = store.getLocalProjectsSnapshot().workspaces[1]
    expect(updated.checkoutOverridesByRootId).toEqual({})
    expect(updated.defaultRootId).toBeUndefined()
    expect(store.resolveLocalWorkspace(task.id)?.defaultRootId).toBe('b')
  })

  it('keeps saved absolute file references and editor context unchanged after root removal', async () => {
    const { store, project, workspace, roots } = await fixture()
    const key = folderWorkspaceKey(workspace.id)
    store.setWorkspaceSession({
      ...store.getWorkspaceSession(),
      activeWorktreeId: key,
      activeWorkspaceKey: key,
      openFilesByWorktree: {
        [key]: [
          {
            filePath: join(roots[0].path, 'note.txt'),
            relativePath: 'note.txt',
            worktreeId: key,
            language: 'plaintext'
          }
        ]
      }
    })
    const session = store.getWorkspaceSession()
    await store.updateLocalProjectRoots(
      {
        projectId: project.id,
        expected: localProjectRootScope(project),
        roots: [roots[1]],
        defaultRootId: 'b'
      },
      idle
    )
    expect(store.getWorkspaceSession()).toEqual(session)
    expect(store.getWorkspaceSession().openFilesByWorktree?.[key][0].filePath).toBe(
      join(roots[0].path, 'note.txt')
    )
  })
})
