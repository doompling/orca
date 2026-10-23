import { useCallback, useRef, useState } from 'react'
import { CLOSE_DIALOG_DEBOUNCE_MS } from './terminal-workspace-model'
import {
  assessWindowCloseRunningWork,
  type WindowCloseRunningWork
} from './terminal/window-close-running-work'
import type { TerminalWorkspaceProjectionController } from './use-terminal-workspace-projection'
import { runWithWindowCloseCheckpointScope } from './window-close-request-coordinator'
import { showShutdownCheckpointFailureToast } from '@/lib/shutdown-checkpoint-failure-toast'
import { useAppStore } from '../store'
import { canRestoreLocalWorkspaceDraftAfterClose } from '@/features/local-projects/local-workspace-draft-close'
import { requestEditorHotExitBackup } from '../../../shared/renderer-restart-preparation'
import {
  formatShutdownCheckpointFailureReason,
  publishShutdownCheckpointFailureReason
} from '../../../shared/renderer-shutdown-events'

export function useTerminalEditorCloseFoundation(
  controller: Pick<TerminalWorkspaceProjectionController, 'openFiles'>
) {
  const { openFiles } = controller
  const [saveDialogFileId, setSaveDialogFileId] = useState<string | null>(null)
  const saveDialogFile = saveDialogFileId
    ? openFiles.find((file) => file.id === saveDialogFileId)
    : null
  const pendingEditorCloseQueueRef = useRef<string[]>([])
  // Why: a close request can carry what to do once its file actually closes; cancel drops it.
  const closedReactionsRef = useRef(new Map<string, () => void>())
  const inFlightSaveFileIdRef = useRef<string | null>(null)
  const isClosingRef = useRef(false)
  const closeDialogDebounceTimersRef = useRef<Set<number>>(new Set())
  const releaseCloseDialogGuardAfterDebounce = useCallback(() => {
    const timer = window.setTimeout(() => {
      closeDialogDebounceTimersRef.current.delete(timer)
      isClosingRef.current = false
    }, CLOSE_DIALOG_DEBOUNCE_MS)
    closeDialogDebounceTimersRef.current.add(timer)
  }, [])
  const [windowCloseDialogOpen, setWindowCloseDialogOpen] = useState(false)
  // Why: "running" and "could not reach the host" are different claims, and telling the user
  // processes are running when the truth is that a host went quiet is the fabricated certainty
  // docs/reference/ssh-execution-boundary.md forbids.
  const [windowCloseDialogKind, setWindowCloseDialogKind] =
    useState<Exclude<WindowCloseRunningWork['kind'], 'none'>>('running')
  const windowCloseAfterDirtyRef = useRef<{ isQuitting: boolean } | null>(null)

  const confirmNativeWindowClose = useCallback(() => {
    const confirm = (): void => {
      // Capture only after every close guard has committed.
      const accepted = runWithWindowCloseCheckpointScope(() =>
        window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
      )
      if (!accepted) {
        showShutdownCheckpointFailureToast()
        return
      }
      window.api.ui.confirmWindowClose()
    }
    const state = useAppStore.getState()
    const dirtyFiles = state.openFiles.filter((file) => file.isDirty)
    if (
      dirtyFiles.length > 0 &&
      dirtyFiles.every((file) => canRestoreLocalWorkspaceDraftAfterClose(state, file))
    ) {
      // Use the existing restart backup to flush pending drafts and quiesce saves.
      void requestEditorHotExitBackup(window)
        .then(confirm)
        .catch((error) => {
          publishShutdownCheckpointFailureReason(formatShutdownCheckpointFailureReason(error))
          showShutdownCheckpointFailureToast()
        })
      return
    }
    confirm()
  }, [])

  const proceedToNativeWindowClose = useCallback(
    (isQuitting: boolean) => {
      void assessWindowCloseRunningWork({ isQuitting })
        .then((runningWork) => {
          if (runningWork.kind === 'none') {
            confirmNativeWindowClose()
            return
          }
          setWindowCloseDialogKind(runningWork.kind)
          setWindowCloseDialogOpen(true)
        })
        // Why: the assessment must never be able to trap the window. A thrown store read is
        // not evidence either way, and a close that silently does nothing is unrecoverable
        // without SIGKILL, so fall through to the close the user actually asked for.
        .catch(() => {
          confirmNativeWindowClose()
        })
    },
    [confirmNativeWindowClose]
  )

  return {
    saveDialogFileId,
    setSaveDialogFileId,
    saveDialogFile,
    pendingEditorCloseQueueRef,
    closedReactionsRef,
    inFlightSaveFileIdRef,
    isClosingRef,
    closeDialogDebounceTimersRef,
    releaseCloseDialogGuardAfterDebounce,
    windowCloseDialogOpen,
    setWindowCloseDialogOpen,
    windowCloseDialogKind,
    windowCloseAfterDirtyRef,
    confirmNativeWindowClose,
    proceedToNativeWindowClose
  }
}

export type TerminalEditorCloseFoundation = TerminalWorkspaceProjectionController &
  ReturnType<typeof useTerminalEditorCloseFoundation>
