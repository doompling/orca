import { describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { createTestStore, seedStore } from './store-test-helpers'

vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: vi.fn() }))

function localProjects(): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Project',
        roots: [
          { id: 'first', label: 'App A', path: '/code/app-a' },
          { id: 'second', label: 'App B', path: '/code/app-b' }
        ],
        defaultRootId: 'second',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: ['workspace-a', 'workspace-b'].map((id) => ({
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

function createLocalStore() {
  const store = createTestStore()
  seedStore(store, {
    localProjects: localProjects(),
    activeWorktreeId: 'folder:workspace-a'
  })
  return store
}

describe('Local Workspace terminal creation', () => {
  it('pins the declared default cwd without changing Workspace identity', async () => {
    const store = createLocalStore()
    await store.getState().openNewTerminalTabInActiveWorkspace('group')
    expect(store.getState().tabsByWorktree['folder:workspace-a']).toEqual([
      expect.objectContaining({ worktreeId: 'folder:workspace-a', startupCwd: '/code/app-b' })
    ])
  })

  it('uses an explicit root and the Workspace checkout override', async () => {
    const store = createLocalStore()
    const state = localProjects()
    state.workspaces[0].checkoutOverridesByRootId.first = '/checkouts/app-a'
    store.setState({ localProjects: state })
    await store.getState().openNewTerminalTabInActiveWorkspace('group', { rootId: 'first' })
    expect(store.getState().tabsByWorktree['folder:workspace-a'][0]?.startupCwd).toBe(
      '/checkouts/app-a'
    )
  })

  it('refuses an unknown root before creating a tab', async () => {
    const store = createLocalStore()
    await expect(
      store.getState().openNewTerminalTabInActiveWorkspace('group', { rootId: 'unknown' })
    ).rejects.toThrow('The selected Workspace root is unavailable.')
    expect(store.getState().tabsByWorktree['folder:workspace-a'] ?? []).toEqual([])
  })

  it('keeps two Workspaces sharing one directory in separate tab owners', async () => {
    const store = createLocalStore()
    await store.getState().openNewTerminalTabInActiveWorkspace('group-a')
    store.setState({ activeWorktreeId: 'folder:workspace-b' })
    await store.getState().openNewTerminalTabInActiveWorkspace('group-b')
    const first = store.getState().tabsByWorktree['folder:workspace-a'][0]
    const second = store.getState().tabsByWorktree['folder:workspace-b'][0]
    expect(first?.startupCwd).toBe(second?.startupCwd)
    expect(first?.id).not.toBe(second?.id)
    expect(first?.worktreeId).not.toBe(second?.worktreeId)
  })
})
