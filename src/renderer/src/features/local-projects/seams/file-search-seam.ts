import type { SearchOptions, SearchResult } from '../../../../../shared/code-search-types'
import { resolveLocalWorkspaceKey } from '../../../../../shared/local-projects/workspace-resolution'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { useAppStore } from '@/store'
import { searchLocalWorkspaceContents } from '../local-workspace-content-search'

type FileSearch = (
  context: RuntimeFileOperationArgs,
  options: SearchOptions,
  signal?: AbortSignal
) => Promise<SearchResult>

/** A search across every root of a local multi-root Workspace, shaped like `searchRuntimeFiles`;
 *  null for any other workspace so the caller's runtime search runs unchanged. */
export function localWorkspaceFileSearch(
  worktreeId: string,
  isCurrent: () => boolean
): FileSearch | null {
  const { localProjects } = useAppStore.getState()
  const workspace = localProjects ? resolveLocalWorkspaceKey(localProjects, worktreeId) : null
  if (!workspace) {
    return null
  }
  return (_context, { rootPath: _rootPath, ...options }, signal) =>
    searchLocalWorkspaceContents(workspace, options, isCurrent, signal)
}
