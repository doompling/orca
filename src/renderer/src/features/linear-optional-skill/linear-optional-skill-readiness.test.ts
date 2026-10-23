import { describe, expect, it } from 'vitest'
import type { TaskProvider } from '../../../../shared/task-providers'
import {
  getStalledVisibleTaskProviders,
  getTaskProviderCompletedSteps,
  getTaskProviderSetupStatus,
  isTaskProviderReady,
  type TaskProviderReadiness
} from '@/components/settings/task-source-setup-state'
import { withoutLinearSkillRequirement } from './linear-optional-skill-readiness'

const linear = (overrides: Partial<TaskProviderReadiness>): TaskProviderReadiness =>
  withoutLinearSkillRequirement({
    connected: true,
    checking: false,
    skillInstalled: false,
    skillChecking: false,
    skillUnverifiable: false,
    visible: true,
    ...overrides
  })

describe('optional Linear agent skill', () => {
  it('counts only connection and visibility, and is ready without the skill', () => {
    expect(getTaskProviderCompletedSteps(linear({}))).toEqual({ completed: 2, total: 2 })
    expect(getTaskProviderSetupStatus(linear({}))).toBe('ready')
  })

  it('waits for connection checks but not skill scans', () => {
    expect(isTaskProviderReady(linear({ skillChecking: true }))).toBe(true)
    expect(isTaskProviderReady(linear({ checking: true }))).toBe(false)
  })

  it('does not block on an unverifiable skill scan', () => {
    expect(getTaskProviderSetupStatus(linear({ skillUnverifiable: true }))).toBe('ready')
  })

  it('never reports Linear as stalled because of the skill', () => {
    const readinessByProvider: Record<TaskProvider, TaskProviderReadiness> = {
      github: { connected: true, checking: false, visible: true },
      gitlab: { connected: true, checking: false, visible: true },
      linear: linear({}),
      jira: { connected: true, checking: false, visible: true }
    }
    expect(getStalledVisibleTaskProviders(['linear'], readinessByProvider)).toEqual([])
    readinessByProvider.linear = linear({ connected: false, skillInstalled: true })
    expect(getStalledVisibleTaskProviders(['linear'], readinessByProvider)).toEqual([])
  })
})
