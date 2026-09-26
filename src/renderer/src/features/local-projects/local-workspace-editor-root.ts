import type { OpenFile } from '@/store/slices/editor'
import { getRelativePathInsideRoot } from '@/lib/path'
import type { LocalProjectRoot, LocalProjectsState } from '../../../../shared/local-projects/types'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'

export function getLocalWorkspaceEditorRoot(
  catalog: LocalProjectsState | undefined,
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'runtimeEnvironmentId' | 'externalSshTargetId'>
): LocalProjectRoot | null {
  if (!catalog || file.runtimeEnvironmentId || file.externalSshTargetId) {
    return null
  }
  const workspace = resolveLocalWorkspaceKey(catalog, file.worktreeId)
  let match: LocalProjectRoot | null = null
  let shortestRelativePath = Infinity
  for (const root of workspace?.roots ?? []) {
    const relativePath = getRelativePathInsideRoot(file.filePath, root.path)
    if (relativePath && relativePath.length < shortestRelativePath) {
      match = root
      shortestRelativePath = relativePath.length
    }
  }
  return match
}
