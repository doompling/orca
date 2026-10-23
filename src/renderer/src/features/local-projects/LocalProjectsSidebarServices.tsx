import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { LocalWorkspaceShortcuts } from './LocalWorkspaceShortcuts'

/** Always mounted beside the sidebar: loads the local Projects catalog for the active profile
 *  and keeps the local Workspace shortcuts live while the sidebar is collapsed. */
export function LocalProjectsSidebarServices(): React.JSX.Element {
  const profileId = useAppStore((s) => s.activeOrcaProfileId)
  const switching = useAppStore((s) => s.orcaProfileSwitching)
  useEffect(() => {
    if (!switching) {
      void useAppStore
        .getState()
        .fetchLocalProjects()
        .catch(() => undefined)
    }
  }, [profileId, switching])
  return <LocalWorkspaceShortcuts />
}
