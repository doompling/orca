import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'

export function useActiveLocalWorkspace() {
  const catalog = useAppStore((state) => state.localProjects)
  const workspaceKey = useAppStore((state) => state.activeWorktreeId)
  return useMemo(
    () => (workspaceKey ? resolveLocalWorkspaceKey(catalog, workspaceKey) : null),
    [catalog, workspaceKey]
  )
}
