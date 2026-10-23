import type { AppState } from '@/store/types'
import type { OpenFile } from '@/store/slices/editor'
import { flushPendingEditorBuffer } from '@/components/editor/editor-pending-flush'
import type { EditorBufferViewIndex } from '@/store/slices/editor/buffers/editor-buffer-views'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'
import { getLocalWorkspaceEditorRoot } from './local-workspace-editor-root'

function isObsoleteScopeTab(
  file: OpenFile,
  previous: LocalProjectsState,
  current: LocalProjectsState
): boolean {
  if (file.runtimeEnvironmentId || file.externalSshTargetId || file.mirroredFromRuntimeSession) {
    return false
  }
  if (file.localRoot && (file.mode === 'diff' || file.mode === 'conflict-review')) {
    const oldWorkspace = resolveLocalWorkspaceKey(previous, file.worktreeId)
    const newWorkspace = resolveLocalWorkspaceKey(current, file.worktreeId)
    if (oldWorkspace?.workspaceId === file.localRoot.workspaceId) {
      const oldRoot = oldWorkspace.roots.find((root) => root.id === file.localRoot?.rootId)
      const newRoot = newWorkspace?.roots.find((root) => root.id === file.localRoot?.rootId)
      if (
        oldRoot &&
        (!newRoot ||
          normalizeRuntimePathForComparison(oldRoot.path) !==
            normalizeRuntimePathForComparison(newRoot.path))
      ) {
        return true
      }
    }
  }
  return Boolean(
    getLocalWorkspaceEditorRoot(previous, file) && !getLocalWorkspaceEditorRoot(current, file)
  )
}

type ScopeTabState = Pick<AppState, 'openFiles' | 'editorDrafts' | 'clearUntitled' | 'closeFile'> &
  EditorBufferViewIndex

export function closeObsoleteLocalWorkspaceTabs(
  previous: LocalProjectsState,
  current: LocalProjectsState,
  get: () => ScopeTabState
): number {
  let retained = 0
  const obsoleteIds = get()
    .openFiles.filter((file) => isObsoleteScopeTab(file, previous, current))
    .map((file) => file.id)
  for (const fileId of obsoleteIds) {
    flushPendingEditorBuffer(get(), fileId)
    const state = get()
    const file = state.openFiles.find((entry) => entry.id === fileId)
    if (!file || !isObsoleteScopeTab(file, previous, current)) {
      continue
    }
    if (file.isDirty || state.editorDrafts[fileId] !== undefined) {
      retained += 1
      continue
    }
    // Scope changes close tabs, never delete the files created for untitled editors.
    if (file.isUntitled) {
      state.clearUntitled(fileId)
    }
    get().closeFile(fileId)
  }
  return retained
}
