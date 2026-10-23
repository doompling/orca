import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'

export function useActiveLocalWorkspace() {
  const catalog = useAppStore((state) => state.localProjects)
  const workspaceKey = useAppStore((state) => state.activeWorktreeId)
  // Partial stores (upstream component tests, paired web clients) carry no local catalog.
  return useMemo(
    () => (catalog && workspaceKey ? resolveLocalWorkspaceKey(catalog, workspaceKey) : null),
    [catalog, workspaceKey]
  )
}
