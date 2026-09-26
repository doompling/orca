import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { normalizeAbsolutePathForComparison } from '@/components/right-sidebar/file-explorer-paths'
import { getDiskBaselineSignature } from '@/components/editor/diff-content-signature'
import { markFileChangedOnDisk } from '@/components/editor/editor-changed-on-disk-mark'
import { readRuntimeFileContent } from '@/runtime/runtime-file-client'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'

export function localWorkspaceEditorSaveTarget(
  state: Pick<AppState, 'localProjects'>,
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'runtimeEnvironmentId' | 'externalSshTargetId'>
): string | null {
  if (
    !state.localProjects ||
    file.runtimeEnvironmentId?.trim() ||
    file.externalSshTargetId ||
    !resolveLocalWorkspaceKey(state.localProjects, file.worktreeId)
  ) {
    return null
  }
  return normalizeAbsolutePathForComparison(file.filePath)
}

export const LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE =
  'This file changed on disk. Compare, reload, or choose Keep My Edits before saving.'

export async function verifyLocalWorkspaceEditorSave(
  state: Pick<AppState, 'localProjects' | 'setExternalMutation'>,
  file: OpenFile
): Promise<void> {
  if (!localWorkspaceEditorSaveTarget(state, file)) {
    return
  }
  if (file.externalMutation === 'changed') {
    throw new Error(LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE)
  }
  const disk = await readRuntimeFileContent({
    settings: null,
    filePath: file.filePath,
    relativePath: file.relativePath,
    worktreeId: file.worktreeId
  })
  if (disk.isBinary || getDiskBaselineSignature(disk.content) !== file.lastKnownDiskSignature) {
    markFileChangedOnDisk(state, file, { connectionId: undefined, origin: 'live' })
    throw new Error(LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE)
  }
}
