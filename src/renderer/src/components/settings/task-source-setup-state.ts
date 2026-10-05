import type { TaskProvider } from '../../../../shared/task-providers'
import type { IntegrationStatusTone } from '@/components/integration-status-pill'

export type TaskProviderReadiness = {
  connected: boolean
  checking: boolean
  unavailable?: boolean
  /** Optional Linear agent tooling; independent of browsing and linking readiness. */
  skillInstalled?: boolean
  skillChecking?: boolean
  /** The scan could not vouch for `skillInstalled: false`: an unread root, or an error before any answer. */
  skillUnverifiable?: boolean
  visible: boolean
}

export type TaskProviderSetupStatus =
  | 'checking'
  | 'ready'
  | 'connect-required'
  | 'unavailable'
  | 'hidden'
  | 'incomplete'

export const TASK_PROVIDER_SETUP_STATUS_TONE: Record<
  TaskProviderSetupStatus,
  IntegrationStatusTone
> = {
  checking: 'neutral',
  ready: 'connected',
  // Why: hiding a provider is a deliberate choice, not something to warn about.
  hidden: 'neutral',
  'connect-required': 'attention',
  unavailable: 'attention',
  incomplete: 'attention'
}

export function isTaskProviderChecking(readiness: TaskProviderReadiness): boolean {
  return readiness.checking
}

export function getTaskProviderCompletedSteps(readiness: TaskProviderReadiness): {
  completed: number
  total: number
} {
  const total = 2
  let completed = 0
  if (readiness.connected) {
    completed += 1
  }
  if (readiness.visible) {
    completed += 1
  }
  return { completed, total }
}

export function isTaskProviderReady(readiness: TaskProviderReadiness): boolean {
  if (isTaskProviderChecking(readiness) || readiness.unavailable) {
    return false
  }
  const { completed, total } = getTaskProviderCompletedSteps(readiness)
  return completed === total
}

export function getTaskProviderSetupStatus(
  readiness: TaskProviderReadiness
): TaskProviderSetupStatus {
  if (!readiness.visible) {
    return 'hidden'
  }
  if (isTaskProviderChecking(readiness)) {
    return 'checking'
  }
  if (readiness.unavailable) {
    return 'unavailable'
  }
  if (isTaskProviderReady(readiness)) {
    return 'ready'
  }
  if (!readiness.connected) {
    return 'connect-required'
  }
  // Future provider requirements may leave a connected source incomplete.
  return 'incomplete'
}

// Exclude in-flight checks so a cold settings open does not flash a warning.
export function getIncompleteVisibleTaskProviders(
  providers: readonly TaskProvider[],
  readinessByProvider: Record<TaskProvider, TaskProviderReadiness>
): TaskProvider[] {
  return providers.filter((provider) => {
    const readiness = readinessByProvider[provider]
    if (!readiness.visible || isTaskProviderChecking(readiness)) {
      return false
    }
    return !isTaskProviderReady(readiness)
  })
}

// An untouched source is not stalled; optional skill installation is independent.
export function hasStartedTaskProviderSetup(readiness: TaskProviderReadiness): boolean {
  return readiness.connected
}

// Warn only about setup that started and stalled partway.
export function getStalledVisibleTaskProviders(
  providers: readonly TaskProvider[],
  readinessByProvider: Record<TaskProvider, TaskProviderReadiness>
): TaskProvider[] {
  return getIncompleteVisibleTaskProviders(providers, readinessByProvider).filter((provider) =>
    hasStartedTaskProviderSetup(readinessByProvider[provider])
  )
}

// Expand one unfinished provider because defaults expose every provider.
export function getAutoExpandedTaskProvider(
  providers: readonly TaskProvider[],
  readinessByProvider: Record<TaskProvider, TaskProviderReadiness>
): TaskProvider | null {
  return getIncompleteVisibleTaskProviders(providers, readinessByProvider)[0] ?? null
}

// Auto-expand is a one-time first-open affordance. Once a card has claimed it,
// it keeps it for the life of the pane: releasing the slot when that provider
// finishes (or gets hidden) would let a later gh/glab preflight pop a different
// card open under the user, and could unmount an open install terminal.
export function resolveStickyAutoExpandedTaskProvider({
  providers,
  readinessByProvider,
  previousAutoExpanded
}: {
  providers: readonly TaskProvider[]
  readinessByProvider: Record<TaskProvider, TaskProviderReadiness>
  previousAutoExpanded: TaskProvider | null
}): TaskProvider | null {
  return previousAutoExpanded ?? getAutoExpandedTaskProvider(providers, readinessByProvider)
}
