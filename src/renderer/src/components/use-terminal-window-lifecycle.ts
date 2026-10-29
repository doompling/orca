import { useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { isIntentionalAppRestartInProgress } from '@/lib/updater-beforeunload'
import { preventUnloadAndScheduleShutdownCheckpointReset } from '@/lib/shutdown-checkpoint-guard'
import { setWindowCloseRequestHandler } from './window-close-request-coordinator'
import {
  collectBrowserWebviewIds,
  destroyWebviewsRemovedFromStore
} from '../store/slices/browser-webview-cleanup'
import type { TerminalActivationController } from './use-terminal-activation-actions'
// Ether seam: editor — restorable local Workspace drafts do not block window close.
import {
  dirtyFilesRequiringWindowCloseConfirmation,
  flushPendingLocalWorkspaceDrafts
} from '@/features/local-projects/local-workspace-draft-close'

export function useTerminalWindowLifecycle(controller: TerminalActivationController): void {
  const {
    activeBrowserTabId,
    activeTabType,
    activeWorktreeBrowserTabIdsKey,
    proceedToNativeWindowClose,
    queueEditorCloseRequests,
    renderedActiveWorktreeId,
    setActiveBrowserTab,
    setActiveTabType,
    windowCloseAfterDirtyRef
  } = controller
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      if (isIntentionalAppRestartInProgress()) {
        return
      }
      const dirtyFiles = dirtyFilesRequiringWindowCloseConfirmation(useAppStore.getState())
      if (dirtyFiles.length > 0) {
        preventUnloadAndScheduleShutdownCheckpointReset(event, window)
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    setWindowCloseRequestHandler(({ isQuitting }) => {
      if (isIntentionalAppRestartInProgress()) {
        window.api.ui.confirmWindowClose()
        return
      }
      if (windowCloseAfterDirtyRef.current) {
        return
      }
      // Rich editors mark dirty before their debounced draft reaches the session store.
      flushPendingLocalWorkspaceDrafts(useAppStore.getState())
      const dirtyFiles = dirtyFilesRequiringWindowCloseConfirmation(useAppStore.getState())
      if (dirtyFiles.length > 0) {
        queueEditorCloseRequests(
          dirtyFiles.map((file) => file.id),
          { isQuitting }
        )
        return
      }
      proceedToNativeWindowClose(isQuitting)
    })
    return () => setWindowCloseRequestHandler(null)
  }, [proceedToNativeWindowClose, queueEditorCloseRequests, windowCloseAfterDirtyRef])

  // Initialize lazily: eager useRef arguments walk every browser page/tab again on every render.
  const prevBrowserWebviewIdsRef = useRef<Set<string>>(undefined!)
  prevBrowserWebviewIdsRef.current ??= collectBrowserWebviewIds(
    useAppStore.getState().browserTabsByWorktree,
    useAppStore.getState().browserPagesByWorkspace
  )
  useEffect(() => {
    let prevBrowserTabs = useAppStore.getState().browserTabsByWorktree
    let prevBrowserPages = useAppStore.getState().browserPagesByWorkspace
    return useAppStore.subscribe((state) => {
      if (
        state.browserTabsByWorktree === prevBrowserTabs &&
        state.browserPagesByWorkspace === prevBrowserPages
      ) {
        return
      }
      prevBrowserTabs = state.browserTabsByWorktree
      prevBrowserPages = state.browserPagesByWorkspace
      prevBrowserWebviewIdsRef.current = destroyWebviewsRemovedFromStore(
        prevBrowserWebviewIdsRef.current,
        state.browserTabsByWorktree,
        state.browserPagesByWorkspace
      )
    })
  }, [])

  useEffect(() => {
    const activeWorktreeBrowserTabs = renderedActiveWorktreeId
      ? (useAppStore.getState().browserTabsByWorktree[renderedActiveWorktreeId] ?? [])
      : []
    if (
      activeTabType === 'browser' &&
      renderedActiveWorktreeId &&
      (!activeBrowserTabId ||
        !activeWorktreeBrowserTabs.some((tab) => tab.id === activeBrowserTabId))
    ) {
      const fallbackBrowserTab = activeWorktreeBrowserTabs[0]
      if (fallbackBrowserTab) {
        setActiveBrowserTab(fallbackBrowserTab.id)
      } else {
        setActiveTabType('terminal', renderedActiveWorktreeId)
      }
    }
  }, [
    activeTabType,
    renderedActiveWorktreeId,
    activeBrowserTabId,
    activeWorktreeBrowserTabIdsKey,
    setActiveBrowserTab,
    setActiveTabType
  ])
}
