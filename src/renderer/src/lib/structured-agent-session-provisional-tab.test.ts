import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../shared/tab-types'
import type { AgentSessionLaunchPlan } from './agent-session-launch-plan'
import { beginStructuredAgentSessionProvisionalLaunch } from './structured-agent-session-provisional-tab'

const state = vi.hoisted(() => ({
  unifiedTabsByWorktree: {},
  createUnifiedTab: vi.fn(),
  setActiveTabType: vi.fn(),
  focusGroup: vi.fn(),
  activateTab: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))

const tab: Tab = {
  id: 'tab',
  entityId: 'session',
  groupId: 'group',
  worktreeId: 'workspace',
  contentType: 'agent-session',
  label: 'Chat',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

beforeEach(() => {
  vi.clearAllMocks()
  state.createUnifiedTab.mockReturnValue(tab)
})

describe('structured provider provisional tabs', () => {
  it.each(['codex', 'claude', 'opencode'] as const)(
    'opens %s immediately while acquisition runs',
    (agent) => {
      const cancel = vi.fn()
      const plan: AgentSessionLaunchPlan = {
        agent,
        route: 'structured-native-chat',
        worktreeId: 'workspace',
        begin: () => ({
          sessionId: 'session',
          settlement: Promise.resolve({ kind: 'structured', sessionId: 'session' }),
          cancel
        }),
        launch: async () => null
      }
      expect(beginStructuredAgentSessionProvisionalLaunch({ plan, hooks: {} })?.tab).toEqual(tab)
      expect(state.createUnifiedTab).toHaveBeenCalledWith(
        'workspace',
        'agent-session',
        expect.objectContaining({ agentSessionAgent: agent, entityId: 'session' })
      )
      expect(cancel).not.toHaveBeenCalled()
    }
  )
})
