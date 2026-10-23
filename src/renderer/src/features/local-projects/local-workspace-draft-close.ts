import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { shouldPersistWorkspaceSession } from '@/lib/workspace-session'
import { flushPendingEditorBuffer } from '@/components/editor/editor-pending-flush'
import type { EditorBufferViewIndex } from '@/store/slices/editor/buffers/editor-buffer-views'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'

type DraftCloseState = Pick<
  AppState,
  'localProjects' | 'editorDrafts' | 'workspaceSessionReady' | 'hydrationSucceeded'
>

function isLocalWorkspaceEditableFile(
  state: Pick<DraftCloseState, 'localProjects'>,
  file: OpenFile
): boolean {
  return Boolean(
    file.mode === 'edit' &&
    !file.readOnly &&
    !file.runtimeEnvironmentId?.trim() &&
    !file.externalSshTargetId &&
    state.localProjects &&
    resolveLocalWorkspaceKey(state.localProjects, file.worktreeId)
  )
}

export function flushPendingLocalWorkspaceDrafts(
  state: Pick<AppState, 'localProjects' | 'openFiles'> & EditorBufferViewIndex
): void {
  for (const file of state.openFiles) {
    if (file.isDirty && isLocalWorkspaceEditableFile(state, file)) {
      flushPendingEditorBuffer(state, file.id)
    }
  }
}

export function canRestoreLocalWorkspaceDraftAfterClose(
  state: DraftCloseState,
  file: OpenFile
): boolean {
  return (
    shouldPersistWorkspaceSession(state) &&
    state.editorDrafts[file.id] !== undefined &&
    isLocalWorkspaceEditableFile(state, file)
  )
}

export function dirtyFilesRequiringWindowCloseConfirmation(
  state: DraftCloseState & Pick<AppState, 'openFiles'>
): OpenFile[] {
  return state.openFiles.filter(
    (file) => file.isDirty && !canRestoreLocalWorkspaceDraftAfterClose(state, file)
  )
}
