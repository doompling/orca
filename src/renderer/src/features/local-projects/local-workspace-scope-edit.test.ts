import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import type { OpenFile } from '@/store/slices/editor'
import { registerPendingEditorFlush } from '@/components/editor/editor-pending-flush'
import * as untitledCleanup from '@/store/slices/editor/tabs/untitled-file-cleanup'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import {
  localProjectRootScope,
  localWorkspaceCheckoutScope
} from '../../../../shared/local-projects/scope-update'
import { closeObsoleteLocalWorkspaceTabs } from './local-workspace-scope-tabs'

function fixture() {
  const catalog: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [
          { id: 'a', label: 'A', path: '/a' },
          { id: 'b', label: 'B', path: '/b' }
        ],
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: ['main', 'other'].map((id) => ({
      id,
      name: id,
      projectId: 'project',
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }))
  }
  const updateProjectRoots = vi.fn().mockResolvedValue(catalog)
  const updateWorkspaceCheckouts = vi.fn().mockResolvedValue(catalog)
  vi.stubGlobal('window', {
    api: { localProjects: { updateProjectRoots, updateWorkspaceCheckouts } }
  })
  const store = createTestStore()
  store.setState({
    localProjects: catalog,
    hydrationSucceeded: true,
    workspaceSessionReady: true,
    terminalStartupRestorationReady: true,
    fetchFolderWorkspacesForAllHosts: vi.fn().mockResolvedValue(undefined)
  })
  const projectArgs = {
    projectId: 'project',
    expected: localProjectRootScope(catalog.projects[0]),
    roots: catalog.projects[0].roots.map((root) => ({ ...root, path: `${root.path}-next` })),
    defaultRootId: 'a'
  }
  const workspaceArgs = {
    workspaceId: 'main',
    expected: localWorkspaceCheckoutScope(catalog.projects[0], catalog.workspaces[0]),
    checkoutOverridesByRootId: { a: '/alternate' },
    defaultRootId: null
  }
  return {
    store,
    catalog,
    projectArgs,
    workspaceArgs,
    updateProjectRoots,
    updateWorkspaceCheckouts
  }
}

function file(workspaceId = 'other') {
  return {
    id: 'file',
    worktreeId: `folder:${workspaceId}`,
    filePath: '/a/notes.txt',
    relativePath: 'notes.txt',
    language: 'plaintext',
    mode: 'edit' as const,
    isDirty: false
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('guarded local scope editing', () => {
  it('refuses an empty dirty draft in an inactive affected Workspace before IPC', async () => {
    const { store, projectArgs, updateProjectRoots } = fixture()
    store.setState({ openFiles: [file()], editorDrafts: { file: '' } })
    await expect(store.getState().updateLocalProjectRoots(projectArgs)).rejects.toThrow(
      'unsaved edits in other'
    )
    expect(updateProjectRoots).not.toHaveBeenCalled()
    expect(store.getState().editorDrafts).toEqual({ file: '' })
  })

  it('permits labels and order with dirty files and incomplete session restoration', async () => {
    const { store, catalog, projectArgs, updateProjectRoots } = fixture()
    store.setState({ openFiles: [{ ...file(), isDirty: true }], hydrationSucceeded: false })
    const roots = catalog.projects[0].roots
      .toReversed()
      .map((root) => ({ ...root, label: `New ${root.label}` }))
    await store.getState().updateLocalProjectRoots({ ...projectArgs, roots })
    expect(updateProjectRoots).toHaveBeenCalledWith({ ...projectArgs, roots })
  })

  it('refuses live and queued startup without stopping anything', async () => {
    const { store, projectArgs, updateProjectRoots } = fixture()
    store.getState().createTab('folder:main')
    const tab = store.getState().tabsByWorktree['folder:main'][0]
    store.setState({ ptyIdsByTabId: { [tab.id]: ['pty'] } })
    await expect(store.getState().updateLocalProjectRoots(projectArgs)).rejects.toThrow(
      'Nothing was stopped'
    )
    store.setState({ ptyIdsByTabId: {}, pendingStartupByTabId: { [tab.id]: { command: 'codex' } } })
    await expect(store.getState().updateLocalProjectRoots(projectArgs)).rejects.toThrow(
      'Nothing was stopped'
    )
    expect(updateProjectRoots).not.toHaveBeenCalled()
  })

  it('guards restoration before path changes', async () => {
    const { store, workspaceArgs, updateWorkspaceCheckouts } = fixture()
    store.setState({ terminalStartupRestorationReady: false })
    await expect(store.getState().updateLocalWorkspaceCheckouts(workspaceArgs)).rejects.toThrow(
      'finish restoring'
    )
    expect(updateWorkspaceCheckouts).not.toHaveBeenCalled()
  })

  it('closes obsolete clean tabs only in the chosen Workspace and preserves other drafts', async () => {
    const { store, catalog, workspaceArgs, updateWorkspaceCheckouts } = fixture()
    const next = structuredClone(catalog)
    next.workspaces[0].checkoutOverridesByRootId = workspaceArgs.checkoutOverridesByRootId
    updateWorkspaceCheckouts.mockResolvedValue(next)
    const files = [file(), file('main')]
    files[1].id = 'clean'
    store.setState({ openFiles: files, editorDrafts: { file: 'unsaved elsewhere' } })
    await store.getState().updateLocalWorkspaceCheckouts(workspaceArgs)
    expect(updateWorkspaceCheckouts).toHaveBeenCalledWith(workspaceArgs)
    expect(store.getState().openFiles).toEqual([files[0]])
    expect(store.getState().editorDrafts).toEqual({ file: 'unsaved elsewhere' })
    expect(store.getState().recentlyClosedEditorTabsByWorktree['folder:main'][0].filePath).toBe(
      '/a/notes.txt'
    )
  })

  it('refuses stale expected roots without replacing them with the latest state', async () => {
    const { store, catalog, projectArgs, updateProjectRoots } = fixture()
    store.setState({
      localProjects: { ...catalog, projects: [{ ...catalog.projects[0], defaultRootId: 'b' }] }
    })
    await expect(store.getState().updateLocalProjectRoots(projectArgs)).rejects.toThrow(
      'Project directories changed'
    )
    expect(updateProjectRoots).not.toHaveBeenCalled()
  })

  it('keeps the prior catalog on a host refusal', async () => {
    const { store, catalog, workspaceArgs, updateWorkspaceCheckouts } = fixture()
    const files = [file('main')]
    store.setState({ openFiles: files })
    updateWorkspaceCheckouts.mockRejectedValue(new Error('Close the running built-in chat first.'))
    await expect(store.getState().updateLocalWorkspaceCheckouts(workspaceArgs)).rejects.toThrow(
      'running built-in chat'
    )
    expect(store.getState().localProjects).toBe(catalog)
    expect(store.getState().openFiles).toBe(files)
  })

  it('keeps an edit made during host submission and reports its original target', async () => {
    const { store, catalog, workspaceArgs, updateWorkspaceCheckouts } = fixture()
    const next = structuredClone(catalog)
    next.workspaces[0].checkoutOverridesByRootId = workspaceArgs.checkoutOverridesByRootId
    store.setState({ openFiles: [file('main')] })
    updateWorkspaceCheckouts.mockImplementation(async () => {
      store.setState({ editorDrafts: { file: '' } })
      return next
    })
    await store.getState().updateLocalWorkspaceCheckouts(workspaceArgs)
    expect(store.getState().localProjects).toBe(next)
    expect(store.getState().openFiles).toEqual([file('main')])
    expect(store.getState().editorDrafts).toEqual({ file: '' })
    expect(store.getState().localProjectsError).toContain('kept open with unsaved edits')
    expect(store.getState().localProjectsError).toContain(
      'Their original file paths were preserved'
    )
  })
})

describe('obsolete local scope tabs', () => {
  it('closes clean removed-root tabs in each affected Workspace, preserving other targets', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots.pop()
    const a = file('main')
    const outside = { ...file('main'), id: 'outside', filePath: '/elsewhere/notes.txt' }
    store.setState({
      openFiles: [
        a,
        outside,
        { ...file('main'), id: 'b-main', filePath: '/b/notes.txt' },
        { ...file('other'), id: 'b-other', filePath: '/b/notes.txt' }
      ]
    })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(0)
    expect(store.getState().openFiles).toEqual([a, outside])
  })

  it('does not close tabs for a label, order, or default-directory change', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots.reverse()
    next.projects[0].roots[0].label = 'Renamed'
    next.projects[0].defaultRootId = 'b'
    const files = [file(), { ...file('main'), id: 'b', filePath: '/b/notes.txt' }]
    store.setState({ openFiles: files })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(0)
    expect(store.getState().openFiles).toBe(files)
  })

  it('closes a rebound root diff even when another root still contains its old absolute path', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots[0].path = '/alternate'
    next.projects[0].roots[1].path = '/a'
    const edit = file('main')
    const diff: OpenFile = {
      ...edit,
      id: 'diff',
      mode: 'diff',
      localRoot: { workspaceId: 'main', rootId: 'a' }
    }
    store.setState({ openFiles: [edit, diff] })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(0)
    expect(store.getState().openFiles).toEqual([edit])
    expect(edit.filePath).toBe('/a/notes.txt')
  })

  it('keeps remote, mirrored, SSH, and legacy owners untouched', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots[0].path = '/alternate'
    const files: OpenFile[] = [
      { ...file(), id: 'remote', runtimeEnvironmentId: 'host' },
      { ...file(), id: 'ssh', externalSshTargetId: 'ssh' },
      { ...file(), id: 'mirror', mirroredFromRuntimeSession: true },
      { ...file(), id: 'legacy', worktreeId: 'legacy-worktree' }
    ]
    store.setState({ openFiles: files })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(0)
    expect(store.getState().openFiles).toBe(files)
  })

  it.each([
    { isDirty: true, draft: undefined },
    { isDirty: false, draft: '' }
  ])('never closes dirty or drafted tabs: %j', ({ isDirty, draft }) => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots[0].path = '/alternate'
    const files = [{ ...file(), isDirty }]
    store.setState({ openFiles: files, editorDrafts: draft === undefined ? {} : { file: draft } })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(1)
    expect(store.getState().openFiles).toBe(files)
    expect(store.getState().editorDrafts.file).toBe(draft)
  })

  it('flushes pending editor changes before deciding whether a tab is clean', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots[0].path = '/alternate'
    store.setState({ openFiles: [file()] })
    const unregister = registerPendingEditorFlush('file', () => {
      store.setState({ editorDrafts: { file: 'pending keystroke' } })
    })
    try {
      expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(1)
      expect(store.getState().openFiles).toEqual([file()])
      expect(store.getState().editorDrafts.file).toBe('pending keystroke')
    } finally {
      unregister()
    }
  })

  it('closes an untouched untitled tab without deleting its actual file', () => {
    const { store, catalog } = fixture()
    const next = structuredClone(catalog)
    next.projects[0].roots[0].path = '/alternate'
    const deleteUntitled = vi.spyOn(untitledCleanup, 'deleteUntouchedUntitledFile')
    store.setState({ openFiles: [{ ...file(), isUntitled: true }] })
    expect(closeObsoleteLocalWorkspaceTabs(catalog, next, store.getState)).toBe(0)
    expect(store.getState().openFiles).toEqual([])
    expect(deleteUntitled).not.toHaveBeenCalled()
    expect(store.getState().recentlyClosedEditorTabsByWorktree['folder:other'][0]).toMatchObject({
      filePath: '/a/notes.txt',
      isUntitled: undefined
    })
  })
})
