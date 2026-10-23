import type { TaskProvider } from '../../../../shared/task-providers'
import type { TaskProviderReadiness } from '@/components/settings/task-source-setup-state'

type LinearBrowsingReadiness<T extends TaskProviderReadiness> = Omit<
  T,
  'skillInstalled' | 'skillChecking' | 'skillUnverifiable'
>

/** Ether's Linear agent skill is optional: setup counts only connection and visibility. */
export function withoutLinearSkillRequirement<T extends TaskProviderReadiness>(
  readiness: T
): LinearBrowsingReadiness<T> {
  const {
    skillInstalled: _skillInstalled,
    skillChecking: _skillChecking,
    skillUnverifiable: _skillUnverifiable,
    ...browsing
  } = readiness
  return browsing
}

export function withOptionalLinearSkill(
  readinessByProvider: Record<TaskProvider, TaskProviderReadiness>
): Record<TaskProvider, TaskProviderReadiness> {
  return {
    ...readinessByProvider,
    linear: withoutLinearSkillRequirement(readinessByProvider.linear)
  }
}
