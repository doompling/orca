import type { AppState } from '@/store'
import { hasLocalProjectsApi } from './local-projects-availability'

/** Best-effort refresh of local Projects when the repo catalog changes; never throws into the bridge. */
export function refreshLocalProjectsCatalog(state: Pick<AppState, 'fetchLocalProjects'>): void {
  if (hasLocalProjectsApi()) {
    void Promise.resolve()
      .then(() => state.fetchLocalProjects())
      .catch(() => undefined)
  }
}
