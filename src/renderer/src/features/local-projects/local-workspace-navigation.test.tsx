// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { searchWorktrees } from '@/lib/worktree-palette-search'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useWorktreeJumpPaletteStoreState } from '@/components/use-worktree-jump-palette-store-state'
import {
  getVisibleWorktreeShortcutTargets,
  setVisibleWorktreeShortcutTargets
} from '@/components/sidebar/visible-worktrees'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { projectLocalFolderWorkspaces } from '../../../../shared/local-projects/folder-projection'
import {
  localWorkspaceNavigationRows,
  localWorkspacePaletteRows,
  localWorkspaceShortcutTargets,
  rememberLocalWorkspaceNavigation
} from './local-workspace-navigation'

const desktop = vi.hoisted(() => ({ enabled: true }))
vi.mock('./local-projects-availability', () => ({ hasLocalProjectsApi: () => desktop.enabled }))

function catalog(): LocalProjectsState {
  return {
    version: 1,
    projects: ['Application', 'Library'].map((name, index) => ({
      id: `project-${index}`,
      name,
      roots: [
        { id: 'a', label: 'App', path: '/shared/app' },
        { id: 'b', label: 'Library', path: '/shared/library' }
      ],
      defaultRootId: 'b',
      lastWorkspaceId: `workspace-${index}-0`,
      isArchived: false,
      createdAt: index,
      updatedAt: index
    })),
    workspaces: [1, 0].flatMap((project) =>
      [0, 1].map((index) => ({
        id: `workspace-${project}-${index}`,
        projectId: `project-${project}`,
        name: index ? 'Review' : 'Main',
        checkoutOverridesByRootId: {},
        isArchived: false,
        createdAt: index,
        updatedAt: index
      }))
    )
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  setVisibleWorktreeShortcutTargets(null)
  desktop.enabled = true
})

describe('local Workspace navigation projections', () => {
  it('lists Project order then Workspace order, preserving independent same-path contexts', () => {
    const state = catalog()
    const before = structuredClone(state)
    expect(localWorkspaceNavigationRows(state).map(({ workspace }) => workspace.id)).toEqual([
      'workspace-0-0',
      'workspace-0-1',
      'workspace-1-0',
      'workspace-1-1'
    ])
    const rows = localWorkspacePaletteRows(state)
    expect(rows.map((row) => row.displayName)).toEqual([
      'Application / Main',
      'Application / Review',
      'Library / Main',
      'Library / Review'
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(4)
    expect(rows.every((row) => row.path === '/shared/library' && row.hostId === 'local')).toBe(true)
    expect(state).toEqual(before)
  })

  it('searches Project and Workspace names with the existing palette matcher', () => {
    const rows = localWorkspacePaletteRows(catalog())
    expect(
      searchWorktrees(rows, 'Application Review', new Map()).map((row) => row.worktreeId)
    ).toEqual(['folder:workspace-0-1'])
    expect(searchWorktrees(rows, 'Library', new Map()).map((row) => row.worktreeId)).toEqual(
      expect.arrayContaining(['folder:workspace-1-0', 'folder:workspace-1-1'])
    )
  })

  it('numbers digits by mark slot, keeps holes, and skips archived marks', () => {
    const state = catalog()
    const byId = (id: string) => {
      const found = state.workspaces.find((workspace) => workspace.id === id)
      if (!found) {
        throw new Error('Fixture Workspace is missing')
      }
      return found
    }
    expect(localWorkspaceShortcutTargets(state)).toEqual([])
    byId('workspace-0-1').markSlot = 3
    byId('workspace-0-0').markSlot = 1
    byId('workspace-1-0').markSlot = 2
    state.projects[1].isArchived = true
    const targets = localWorkspaceShortcutTargets(state)
    expect(targets).toHaveLength(3)
    expect(targets[0]).toEqual({ id: 'folder:workspace-0-0', executionHostId: 'local' })
    expect(1 in targets).toBe(false)
    expect(targets[2]).toEqual({ id: 'folder:workspace-0-1', executionHostId: 'local' })
  })

  it('uses local visible order rather than stale legacy published shortcut targets', () => {
    useAppStore.setState({ localProjects: catalog() })
    setVisibleWorktreeShortcutTargets([{ id: 'legacy', executionHostId: 'ssh:other' }])
    expect(getVisibleWorktreeShortcutTargets()).toEqual(localWorkspaceShortcutTargets(catalog()))
    desktop.enabled = false
    expect(getVisibleWorktreeShortcutTargets()).toEqual([
      { id: 'legacy', executionHostId: 'ssh:other' }
    ])
  })

  it('feeds local rows into the existing palette owner and updates labels on catalog change', () => {
    const state = catalog()
    useAppStore.setState({ localProjects: state, worktreesByRepo: {} })
    const { result, rerender } = renderHook(() =>
      useWorktreeJumpPaletteStoreState({ visible: true, lingering: true })
    )
    expect(result.current.workspaces).toHaveLength(4)
    useAppStore.setState({
      localProjects: {
        ...state,
        projects: state.projects.map((project) => ({ ...project, name: `${project.name} renamed` }))
      }
    })
    rerender()
    expect(result.current.workspaces[0].displayName).toBe('Application renamed / Main')
    desktop.enabled = false
    rerender()
    expect(result.current.workspaces).toEqual([])
  })
})

describe('remembered local user activation', () => {
  it('writes only successful same-owner active selection, not remote collisions or archives', async () => {
    const localProjects = catalog()
    const updateLocalProject = vi.fn().mockResolvedValue(undefined)
    const state = {
      localProjects,
      updateLocalProject,
      activeWorktreeId: 'folder:workspace-0-1',
      activeWorkspaceExecutionHostId: 'local' as const
    }
    await rememberLocalWorkspaceNavigation(state, 'folder:workspace-0-1')
    expect(updateLocalProject).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project-0',
      updates: { lastWorkspaceId: 'workspace-0-1' }
    })
    updateLocalProject.mockClear()
    await rememberLocalWorkspaceNavigation(
      { ...state, activeWorkspaceExecutionHostId: 'ssh:other' },
      'folder:workspace-0-1'
    )
    await rememberLocalWorkspaceNavigation(state, 'folder:workspace-1-1')
    localProjects.projects[0].isArchived = true
    await rememberLocalWorkspaceNavigation(state, 'folder:workspace-0-1')
    expect(updateLocalProject).not.toHaveBeenCalled()
  })

  it('routes an agent-row/palette folder activation through its folder owner and remembers it', async () => {
    const localProjects = catalog()
    const store = createTestStore()
    const updateLocalProject = vi.fn().mockResolvedValue(undefined)
    const createTab = vi.fn(store.getState().createTab)
    store.setState({
      localProjects,
      folderWorkspaces: projectLocalFolderWorkspaces(localProjects),
      updateLocalProject,
      createTab,
      markWorktreeVisited: vi.fn(),
      recordWorktreeVisit: vi.fn(),
      revealWorktreeInSidebar: vi.fn(),
      getFreshFolderWorkspacePathStatus: () => ({ exists: true, path: '/shared/library' })
    })
    vi.spyOn(useAppStore, 'getState').mockImplementation(() => store.getState())
    expect(
      activateAndRevealWorktree('folder:workspace-0-1', {
        executionHostId: 'local',
        providesInitialSurface: true
      })
    ).toEqual({ primaryTabId: null })
    await Promise.resolve()
    expect(store.getState().activeWorktreeId).toBe('folder:workspace-0-1')
    expect(store.getState().activeRepoId).toBeNull()
    expect(updateLocalProject).toHaveBeenCalledWith({
      projectId: 'project-0',
      updates: { lastWorkspaceId: 'workspace-0-1' }
    })
    expect(createTab).not.toHaveBeenCalled()
  })
})
