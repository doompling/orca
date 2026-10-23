import { createContext, useContext, useMemo } from 'react'
import { useKnownWorktreeById as useUpstreamKnownWorktreeById } from '@/store/selectors'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'

export { useWorktreesForRepo } from '@/store/selectors'

/** The Workspace root a subtree browses, for consumers that only know the Workspace id. */
export const LocalWorkspaceRootContext = createContext<LocalProjectRoot | undefined>(undefined)

/** Upstream's lookup, with the path narrowed to the root this subtree browses, if any. */
export function useKnownWorktreeById(
  worktreeId: string | null
): ReturnType<typeof useUpstreamKnownWorktreeById> {
  const worktree = useUpstreamKnownWorktreeById(worktreeId)
  const rootPath = useContext(LocalWorkspaceRootContext)?.path
  return useMemo(
    () => (worktree && rootPath ? { ...worktree, path: rootPath } : worktree),
    [worktree, rootPath]
  )
}
