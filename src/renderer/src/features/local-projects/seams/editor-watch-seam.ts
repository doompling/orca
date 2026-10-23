import type { LocalProjectsState } from '../../../../../shared/local-projects/types'
import { resolveLocalWorkspaceKey } from '../../../../../shared/local-projects/workspace-resolution'
import { getExternalFileChangeRelativePath } from '@/components/right-sidebar/file-explorer-watch-path'

/** Every root of a local multi-root Workspace, so saves in any root surface as external changes;
 *  null for any other workspace (the caller watches its one folder). */
export function localWorkspaceWatchPaths(
  localProjects: LocalProjectsState | undefined,
  workspaceId: string,
  owner: string | null,
  connectionId: string | null | undefined
): string[] | null {
  if (!localProjects || owner !== null || connectionId) {
    return null
  }
  return resolveLocalWorkspaceKey(localProjects, workspaceId)?.roots.map((root) => root.path) ?? null
}

/**
 * A tab's path relative to the watched root, or null when the file lives under another root of the
 * same Workspace. One Workspace can be watched once per root, so `relativePath` alone is ambiguous.
 */
export function watchTargetRelativePath(
  targetRootPath: string,
  file: { filePath?: string; relativePath: string }
): string | null {
  return file.filePath
    ? getExternalFileChangeRelativePath(targetRootPath, file.filePath, false)
    : file.relativePath
}
