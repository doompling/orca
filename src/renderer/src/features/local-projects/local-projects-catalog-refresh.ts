import type { AppState } from '@/store'
import { hasLocalProjectsApi } from './local-projects-availability'

/** Best-effort refresh of local Projects when the repo catalog changes; never throws into the bridge. */
export function refreshLocalProjectsCatalog(state: Pick<AppState, 'fetchLocalProjects'>): void {
  if (!hasLocalProjectsApi()) {
    return
  }
  try {
    void state.fetchLocalProjects().catch(() => undefined)
  } catch {
    // A store without the local Projects slice (upstream's own bridge tests) has nothing to refresh.
  }
}
