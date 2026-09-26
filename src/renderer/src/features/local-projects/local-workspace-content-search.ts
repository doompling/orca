import type {
  SearchFileResult,
  SearchOptions,
  SearchResult
} from '../../../../shared/code-search-types'
import type { ResolvedLocalWorkspace } from '../../../../shared/local-projects/types'
import { mapWithConcurrency } from '../../../../shared/map-with-concurrency'
import { normalizeSearchFileMatchCount } from '../../../../shared/search-match-count'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { searchRuntimeFiles, statRuntimePath } from '@/runtime/runtime-file-client'

export type LocalWorkspaceSearchFile = SearchFileResult & { workspaceRootLabel?: string }
export type LocalWorkspaceSearchResult = SearchResult & { workspaceSearchErrors?: string[] }

const MAX_SEARCH_RESULTS = 2000
const SEARCH_CONCURRENCY = 2

export async function searchLocalWorkspaceContents(
  workspace: ResolvedLocalWorkspace,
  options: Omit<SearchOptions, 'rootPath'>,
  isCurrent: () => boolean
): Promise<LocalWorkspaceSearchResult> {
  const maxResults = Math.max(
    1,
    Math.min(options.maxResults ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS)
  )
  const baseLimit = Math.floor(maxResults / workspace.roots.length)
  const extra = maxResults % workspace.roots.length
  const rootResults = await mapWithConcurrency(
    workspace.roots,
    SEARCH_CONCURRENCY,
    async (root, index) => {
      const limit = Math.max(1, baseLimit + (index < extra ? 1 : 0))
      if (!isCurrent()) {
        return { root, result: null, error: null }
      }
      try {
        const context = {
          settings: { activeRuntimeEnvironmentId: null },
          worktreeId: folderWorkspaceKey(workspace.workspaceId),
          worktreePath: root.path
        }
        if (!(await statRuntimePath(context, root.path)).isDirectory) {
          throw new Error('Workspace root is not a directory.')
        }
        if (!isCurrent()) {
          return { root, result: null, error: null }
        }
        const result = await searchRuntimeFiles(context, {
          ...options,
          rootPath: root.path,
          maxResults: limit
        })
        return { root, result, error: null }
      } catch (error) {
        return {
          root,
          result: null,
          error: `${root.label}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`
        }
      }
    }
  )
  const files: LocalWorkspaceSearchFile[] = []
  const seenPaths = new Set<string>()
  const workspaceSearchErrors: string[] = []
  let totalMatches = 0
  let truncated = false
  for (const { root, result, error } of rootResults) {
    if (error) {
      workspaceSearchErrors.push(error)
    }
    if (!result) {
      truncated = true
      continue
    }
    truncated ||= result.truncated
    for (const file of result.files) {
      if (seenPaths.has(file.filePath) || file.matches.length === 0) {
        continue
      }
      seenPaths.add(file.filePath)
      const remaining = maxResults - totalMatches
      const matchCount = Math.min(remaining, normalizeSearchFileMatchCount(file))
      truncated ||= matchCount < normalizeSearchFileMatchCount(file)
      if (matchCount > 0) {
        files.push({
          ...file,
          matches: file.matches.slice(0, matchCount),
          matchCount,
          workspaceRootLabel: root.label
        })
        totalMatches += matchCount
      }
    }
  }
  return {
    files,
    totalMatches,
    truncated,
    ...(workspaceSearchErrors.length ? { workspaceSearchErrors } : {})
  }
}
