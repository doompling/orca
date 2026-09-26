// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../store'
import type { OpenFile } from '../store/slices/editor'
import { useTerminalEditorCloseFoundation } from './use-terminal-editor-close-foundation'
import { useTerminalEditorCloseQueue } from './use-terminal-editor-close-queue'
import { useTerminalWindowLifecycle } from './use-terminal-window-lifecycle'
import { dispatchWindowCloseRequest } from './window-close-request-coordinator'
import { registerPendingEditorFlush } from './editor/editor-pending-flush'

type TestState = Pick<
  AppState,
  | 'localProjects'
  | 'editorDrafts'
  | 'openFiles'
  | 'workspaceSessionReady'
  | 'hydrationSucceeded'
  | 'activeWorktreeId'
  | 'browserTabsByWorktree'
  | 'browserPagesByWorkspace'
  | 'unifiedTabsByWorktree'
  | 'groupsByWorktree'
  | 'activeGroupIdByWorktree'
>

const mocks = vi.hoisted(() => {
  const store: { state: TestState | null } = { state: null }
  return {
    store,
    backup: vi.fn(),
    confirm: vi.fn(),
    closeFile: vi.fn(),
    setActiveWorktree: vi.fn(),
    failureToast: vi.fn()
  }
})

vi.mock('../store', () => ({
  useAppStore: {
    getState: () => {
      if (!mocks.store.state) {
        throw new Error('Missing test state')
      }
      return mocks.store.state
    },
    subscribe: () => () => {}
  }
}))
vi.mock('@/lib/updater-beforeunload', () => ({
  isIntentionalAppRestartInProgress: () => false
}))
vi.mock('../../../shared/renderer-restart-preparation', () => ({
  requestEditorHotExitBackup: mocks.backup
}))
vi.mock('./terminal/window-close-running-work', () => ({
  assessWindowCloseRunningWork: async () => ({ kind: 'none' })
}))
vi.mock('@/lib/shutdown-checkpoint-failure-toast', () => ({
  showShutdownCheckpointFailureToast: mocks.failureToast
}))

function fixture(): TestState {
  return {
    localProjects: {
      version: 1,
      projects: [
        {
          id: 'project',
          name: 'Application',
          roots: [{ id: 'app', label: 'App', path: '/app' }],
          defaultRootId: 'app',
          isArchived: false,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      workspaces: ['main', 'investigate', 'maintenance'].map((id) => ({
        id,
        projectId: 'project',
        name: id,
        checkoutOverridesByRootId: {},
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }))
    },
    openFiles: ['main', 'investigate', 'maintenance'].map((id) => ({
      id,
      worktreeId: `folder:${id}`,
      filePath: '/app/README.md',
      relativePath: 'README.md',
      language: 'markdown',
      mode: 'edit',
      isDirty: true
    })),
    editorDrafts: { main: 'Main draft', investigate: 'Investigate draft', maintenance: '' },
    workspaceSessionReady: true,
    hydrationSucceeded: true,
    activeWorktreeId: 'folder:maintenance',
    browserTabsByWorktree: {},
    browserPagesByWorkspace: {},
    unifiedTabsByWorktree: {},
    groupsByWorktree: {},
    activeGroupIdByWorktree: {}
  }
}

function mountCloseFlow(state: TestState) {
  mocks.store.state = state
  return renderHook(() => {
    const foundation = useTerminalEditorCloseFoundation({ openFiles: state.openFiles })
    const queue = useTerminalEditorCloseQueue({
      ...foundation,
      activeWorktreeId: state.activeWorktreeId,
      closeFile: mocks.closeFile,
      setActiveFile: vi.fn(),
      setActiveTabType: vi.fn(),
      setActiveWorktree: mocks.setActiveWorktree
    })
    useTerminalWindowLifecycle({
      ...foundation,
      ...queue,
      activeBrowserTabId: null,
      activeTabType: 'editor',
      activeWorktreeBrowserTabIdsKey: '',
      renderedActiveWorktreeId: state.activeWorktreeId,
      setActiveBrowserTab: vi.fn(),
      setActiveTabType: vi.fn()
    })
    return { ...foundation, ...queue }
  })
}

async function requestClose() {
  await act(async () => dispatchWindowCloseRequest({ isQuitting: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.backup.mockResolvedValue(undefined)
  Object.assign(window, { api: { ui: { confirmWindowClose: mocks.confirm } } })
})
afterEach(() => cleanup())

describe('local Workspace draft hot exit', () => {
  it('flushes the last rich edit before checking whether its draft can survive quit', async () => {
    const state = fixture()
    delete state.editorDrafts.maintenance
    const { result } = mountCloseFlow(state)
    const dispose = registerPendingEditorFlush('maintenance', () => {
      mocks.store.state = {
        ...state,
        editorDrafts: { ...state.editorDrafts, maintenance: 'Last pending edit' }
      }
    })
    try {
      await requestClose()
      expect(mocks.store.state?.editorDrafts.maintenance).toBe('Last pending edit')
      expect(mocks.backup).toHaveBeenCalledOnce()
      expect(mocks.confirm).toHaveBeenCalledOnce()
      expect(mocks.setActiveWorktree).not.toHaveBeenCalled()
      expect(result.current.saveDialogFileId).toBeNull()
    } finally {
      dispose()
    }
  })

  it('backs up independent drafts without navigating away from the last Workspace', async () => {
    const state = fixture()
    const { result } = mountCloseFlow(state)
    await requestClose()

    expect(mocks.backup).toHaveBeenCalledWith(window)
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(state.activeWorktreeId).toBe('folder:maintenance')
    expect(mocks.setActiveWorktree).not.toHaveBeenCalled()
    expect(mocks.closeFile).not.toHaveBeenCalled()
    expect(result.current.saveDialogFileId).toBeNull()
    expect(state.editorDrafts).toEqual(fixture().editorDrafts)
  })

  it('keeps the legacy dirty-file prompt in a mixed session, then backs up local drafts', async () => {
    const state = fixture()
    state.openFiles.push({ ...state.openFiles[0], id: 'legacy', worktreeId: 'repo::/legacy' })
    const { result } = mountCloseFlow(state)
    await requestClose()

    expect(result.current.saveDialogFileId).toBe('legacy')
    expect(result.current.pendingEditorCloseQueueRef.current).toEqual(['legacy'])
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.backup).not.toHaveBeenCalled()

    state.openFiles = state.openFiles.filter((file) => file.id !== 'legacy')
    await act(async () => result.current.advanceEditorCloseQueue())
    expect(mocks.backup).toHaveBeenCalledOnce()
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(state.editorDrafts).toEqual(fixture().editorDrafts)
  })

  it.each(['draft', 'workspaceSessionReady', 'hydrationSucceeded'] as const)(
    'keeps the prompt when %s is unavailable',
    async (missing) => {
      const state = fixture()
      if (missing === 'draft') {
        delete state.editorDrafts.main
      } else {
        state[missing] = false
      }
      const { result } = mountCloseFlow(state)
      await requestClose()
      expect(result.current.saveDialogFileId).toBe('main')
      expect(mocks.confirm).not.toHaveBeenCalled()
      expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
    }
  )

  it.each([
    { runtimeEnvironmentId: 'remote' },
    { externalSshTargetId: 'ssh-host' },
    { mode: 'diff' },
    { readOnly: true }
  ] satisfies Partial<OpenFile>[])(
    'keeps unsupported or remote drafts guarded: %j',
    async (patch) => {
      const state = fixture()
      state.openFiles[0] = { ...state.openFiles[0], ...patch }
      const { result } = mountCloseFlow(state)
      await requestClose()
      expect(result.current.saveDialogFileId).toBe('main')
      expect(mocks.confirm).not.toHaveBeenCalled()
    }
  )

  it('still asks before explicitly closing one local dirty tab', () => {
    const { result } = mountCloseFlow(fixture())
    act(() => result.current.handleCloseFile('main'))
    expect(result.current.saveDialogFileId).toBe('main')
    expect(mocks.closeFile).not.toHaveBeenCalled()
    expect(mocks.backup).not.toHaveBeenCalled()
  })

  it('retains the existing checkpoint veto after preparing draft backup', async () => {
    const state = fixture()
    mountCloseFlow(state)
    const veto = (event: Event) => event.preventDefault()
    window.addEventListener('beforeunload', veto)
    try {
      await requestClose()
      expect(mocks.backup).toHaveBeenCalledOnce()
      expect(mocks.confirm).not.toHaveBeenCalled()
      expect(state.editorDrafts).toEqual(fixture().editorDrafts)
    } finally {
      window.removeEventListener('beforeunload', veto)
    }
  })

  it('does not close if the existing draft-backup preflight fails', async () => {
    mountCloseFlow(fixture())
    mocks.backup.mockRejectedValueOnce(new Error('Missing editor buffer'))
    await requestClose()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.failureToast).toHaveBeenCalledOnce()
  })
})
