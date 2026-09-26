import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerPendingEditorFlush } from '@/components/editor/editor-pending-flush'
import { makeOpenFile, makeTabGroup, makeUnifiedTab } from '@/store/slices/store-test-helpers'
import { captureLocalWorkspaceFileLayout } from './local-workspace-file-layout'
import { applyLocalWorkspaceFileLayout } from './local-workspace-file-layout-apply'
import { fileLayoutFixture } from './local-workspace-file-layout.test-fixtures'

const notice = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { info: notice, error: vi.fn() } }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('copying files through the existing editor/group owners', () => {
  it('rebuilds nested horizontal and vertical split ratios with new leaf identities', () => {
    const { store, sourceKey, targetKey } = fileLayoutFixture()
    const state = store.getState()
    store.setState({
      openFiles: [
        ...state.openFiles,
        makeOpenFile({ id: 'file-d', worktreeId: sourceKey, filePath: '/b/d.txt' })
      ],
      unifiedTabsByWorktree: {
        [sourceKey]: [
          ...state.unifiedTabsByWorktree[sourceKey],
          makeUnifiedTab({
            id: 'tab-d',
            entityId: 'file-d',
            worktreeId: sourceKey,
            groupId: 'bottom',
            contentType: 'editor'
          })
        ]
      },
      groupsByWorktree: {
        [sourceKey]: [
          ...state.groupsByWorktree[sourceKey],
          makeTabGroup({
            id: 'bottom',
            worktreeId: sourceKey,
            activeTabId: 'tab-d',
            tabOrder: ['tab-d']
          })
        ]
      },
      layoutByWorktree: {
        [sourceKey]: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.7,
          first: state.layoutByWorktree[sourceKey],
          second: { type: 'leaf', groupId: 'bottom' }
        }
      }
    })
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    expect(applyLocalWorkspaceFileLayout(store.getState, store.setState, snapshot, 'copy')).toEqual(
      { copied: 4, skipped: 1 }
    )
    expect(store.getState().layoutByWorktree[targetKey]).toMatchObject({
      type: 'split',
      direction: 'vertical',
      ratio: 0.7,
      first: { type: 'split', direction: 'horizontal', ratio: 0.35 },
      second: { type: 'leaf' }
    })
    expect(store.getState().groupsByWorktree[targetKey]).toHaveLength(3)
  })
  it('creates independent identities and preserves split ratios, tab order and active files', () => {
    const { store, sourceKey, targetKey } = fileLayoutFixture()
    const before = store.getState()
    const snapshot = captureLocalWorkspaceFileLayout(before, 'main', 'project')
    expect(applyLocalWorkspaceFileLayout(store.getState, store.setState, snapshot, 'copy')).toEqual(
      { copied: 3, skipped: 1 }
    )
    const state = store.getState()
    const tabs = state.unifiedTabsByWorktree[targetKey]
    const groups = state.groupsByWorktree[targetKey]
    expect(tabs.every((tab) => tab.contentType === 'editor')).toBe(true)
    expect(
      tabs.every(
        (tab) =>
          !before.unifiedTabsByWorktree[sourceKey].some(
            (source) => source.id === tab.id || source.entityId === tab.entityId
          )
      )
    ).toBe(true)
    expect(
      groups.every(
        (group) => !before.groupsByWorktree[sourceKey].some((source) => source.id === group.id)
      )
    ).toBe(true)
    expect(state.layoutByWorktree[targetKey]).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      ratio: 0.35
    })
    expect(groups[0].tabOrder.map((id) => tabs.find((tab) => tab.id === id)?.label)).toEqual([
      'c.txt',
      'a.txt'
    ])
    expect(tabs.find((tab) => tab.id === groups[0].activeTabId)?.label).toBe('a.txt')
    expect(state.activeGroupIdByWorktree[targetKey]).toBe(groups[1].id)
    expect(state.activeWorktreeId).toBe(sourceKey)
    expect(state.activeFileId).toBe(before.activeFileId)
    expect(state.editorDrafts).toEqual({})
    expect(state.tabsByWorktree).toBe(before.tabsByWorktree)
    expect(
      state.openFiles
        .filter((file) => file.worktreeId === targetKey)
        .every((file) => !file.isDirty && !file.lastKnownDiskSignature && !file.localRoot)
    ).toBe(true)
    expect(state.unifiedTabsByWorktree[sourceKey]).toBe(before.unifiedTabsByWorktree[sourceKey])
    expect(state.groupsByWorktree[sourceKey]).toBe(before.groupsByWorktree[sourceKey])
  })

  it('refuses a destination that acquired even an empty group without overwriting it', () => {
    const { store, targetKey } = fileLayoutFixture()
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    store.getState().ensureWorktreeRootGroup(targetKey)
    const before = store.getState()
    expect(() =>
      applyLocalWorkspaceFileLayout(store.getState, store.setState, snapshot, 'copy')
    ).toThrow('fresh, unopened')
    expect(store.getState()).toBe(before)
  })

  it('flushes before snapshot and after async creation, activates only after copy, and reports exclusions after activation', async () => {
    const { store, api, sourceKey, targetKey } = fileLayoutFixture()
    let flushes = 0
    const unregister = registerPendingEditorFlush('file-b', () => {
      flushes += 1
      if (flushes === 2) {
        store.setState({ editorDrafts: { 'file-b': '' } })
      }
    })
    const originalActivate = store.getState().activateLocalWorkspace
    store.setState({
      activateLocalWorkspace: vi.fn(async (id) => {
        expect(store.getState().unifiedTabsByWorktree[targetKey]).toHaveLength(2)
        expect(store.getState().activeWorktreeId).toBe(sourceKey)
        await originalActivate(id)
        expect(notice).not.toHaveBeenCalled()
      })
    })
    try {
      await store
        .getState()
        .createLocalWorkspace(
          { projectId: 'project', name: 'copy' },
          { copyFileLayoutFromWorkspaceId: 'main' }
        )
    } finally {
      unregister()
    }
    expect(flushes).toBe(2)
    expect(api.createWorkspace).toHaveBeenCalledOnce()
    expect(store.getState().activeWorktreeId).toBe(targetKey)
    expect(store.getState().editorDrafts).toEqual({ 'file-b': '' })
    expect(notice).toHaveBeenCalledWith(
      expect.stringContaining('2 saved file tabs copied; 2 tabs excluded')
    )
    expect(store.getState().localProjectsError).toBeNull()
  })

  it('opens the fresh Workspace normally when all tabs are excluded without copying runtime state', async () => {
    const { store, targetKey } = fileLayoutFixture()
    store.setState({ editorDrafts: { 'file-a': '', 'file-b': '', 'file-c': '' } })
    const terminals = store.getState().tabsByWorktree
    await store
      .getState()
      .createLocalWorkspace(
        { projectId: 'project', name: 'copy' },
        { copyFileLayoutFromWorkspaceId: 'main' }
      )
    expect(store.getState().activeWorktreeId).toBe(targetKey)
    expect(store.getState().tabsByWorktree).toBe(terminals)
    expect(store.getState().openFiles.filter((file) => file.worktreeId === targetKey)).toEqual([])
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('0 saved file tabs copied'))
  })

  it('keeps committed creation and copied tabs on partial failure without retrying or changing source selection', async () => {
    const { store, api, sourceKey, targetKey } = fileLayoutFixture()
    const open = store.getState().openFile
    const beforeFile = store.getState().activeFileId
    let count = 0
    store.setState({
      openFile: (file, options) => {
        if (++count === 2) {
          throw new Error('copy interrupted')
        }
        return open(file, options)
      }
    })
    await expect(
      store
        .getState()
        .createLocalWorkspace(
          { projectId: 'project', name: 'copy' },
          { copyFileLayoutFromWorkspaceId: 'main' }
        )
    ).resolves.toBeUndefined()
    expect(api.createWorkspace).toHaveBeenCalledOnce()
    expect(store.getState().localProjectsError).toContain('Workspace was created')
    expect(store.getState().localProjectsError).toContain(
      'Copied 1 file tabs before copying stopped'
    )
    expect(store.getState().unifiedTabsByWorktree[targetKey]).toHaveLength(1)
    expect(store.getState().activeFileId).toBe(beforeFile)
    expect(store.getState().activeWorktreeId).toBe(sourceKey)
    expect(
      store.getState().localProjects.workspaces.some((workspace) => workspace.id === 'copy')
    ).toBe(true)
  })
})
