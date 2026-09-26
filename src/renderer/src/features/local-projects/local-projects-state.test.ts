import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { projectLocalFolderWorkspaces } from '../../../../shared/local-projects/folder-projection'

function fixture(): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [{ id: 'app', label: 'App', path: '/code/app' }],
        defaultRootId: 'app',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: ['main', 'investigate'].map((id) => ({
      id,
      projectId: 'project',
      name: id,
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }))
  }
}

function setup(catalog = fixture()) {
  const getSnapshot = vi.fn().mockResolvedValue(catalog)
  const updateProject = vi.fn().mockResolvedValue(catalog.projects[0])
  const createProject = vi
    .fn()
    .mockResolvedValue({ project: catalog.projects[0], workspace: catalog.workspaces[0] })
  vi.stubGlobal('window', { api: { localProjects: { getSnapshot, updateProject, createProject } } })
  const store = createTestStore()
  store.setState({
    localProjects: catalog,
    folderWorkspaces: projectLocalFolderWorkspaces(catalog),
    fetchFolderWorkspacesForAllHosts: vi.fn().mockResolvedValue(undefined)
  })
  return { store, getSnapshot, updateProject, createProject }
}

afterEach(() => vi.unstubAllGlobals())

describe('Local Project activation and creation', () => {
  it('activates independent folder identities and remembers the Project selection', async () => {
    const { store, updateProject } = setup()
    await store.getState().activateLocalWorkspace('main')
    expect(store.getState().activeWorktreeId).toBe('folder:main')
    await store.getState().activateLocalWorkspace('investigate')
    expect(store.getState().activeWorktreeId).toBe('folder:investigate')
    expect(updateProject).toHaveBeenLastCalledWith({
      projectId: 'project',
      updates: { lastWorkspaceId: 'investigate' }
    })
  })

  it('refuses archived Projects even when their Workspace itself is not archived', async () => {
    const catalog = fixture()
    catalog.projects[0].isArchived = true
    const { store, updateProject } = setup(catalog)
    await expect(store.getState().activateLocalWorkspace('main')).rejects.toThrow(
      'Project is unavailable.'
    )
    expect(store.getState().activeWorktreeId).toBeNull()
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('does not remember a Workspace whose folder projection has not loaded', async () => {
    const { store, updateProject } = setup()
    store.setState({ folderWorkspaces: [] })
    await expect(store.getState().activateLocalWorkspace('main')).rejects.toThrow(
      'Workspace has not loaded.'
    )
    expect(store.getState().activeWorktreeId).toBeNull()
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('does not report committed creation as a retryable creation failure', async () => {
    const { store, getSnapshot, createProject } = setup()
    getSnapshot.mockRejectedValue(new Error('catalog unavailable'))
    await expect(
      store.getState().createLocalProject({ name: 'Application', roots: [{ path: '/code/app' }] })
    ).resolves.toBeUndefined()
    expect(createProject).toHaveBeenCalledTimes(1)
    expect(store.getState().localProjectsError).toContain('was created, but could not be opened')
  })

  it('keeps persistence failures in the creation form', async () => {
    const { store, createProject } = setup()
    createProject.mockRejectedValue(new Error('disk full'))
    await expect(
      store.getState().createLocalProject({ name: 'Application', roots: [{ path: '/code/app' }] })
    ).rejects.toThrow('disk full')
    expect(store.getState().activeWorktreeId).toBeNull()
  })
})
