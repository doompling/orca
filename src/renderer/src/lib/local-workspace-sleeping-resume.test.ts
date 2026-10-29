import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import type { LocalProjectsState } from '../../../shared/local-projects/types'
import { captureLocalWorkspaceLaunchScope } from '../../../shared/local-projects/agent-launch-scope'
import { localWorkspaceAgentArguments } from '../../../shared/local-projects/agent-root-arguments'
import { buildAgentStartupPlan } from '../../../shared/tui-agent-startup'
import { sleepingAgentLaunchConfigSchema } from '../../../shared/workspace-session-sleeping-agents'
import { launchSleepingAgentSession } from './sleeping-agent-session-launch'

const createTab = vi.fn(() => ({ id: 'new-tab' }))
const localProjects: LocalProjectsState = {
  version: 1,
  projects: [
    {
      id: 'project',
      name: 'Project',
      roots: [{ id: 'changed', label: 'Changed', path: '/changed' }],
      defaultRootId: 'changed',
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  workspaces: [
    {
      id: 'workspace',
      projectId: 'project',
      name: 'Workspace',
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }
  ]
}
const store = {
  localProjects,
  settings: {},
  repos: [],
  tabsByWorktree: {},
  agentStatusByPaneKey: {},
  tabBarOrderByWorktree: {},
  openFiles: [],
  getKnownWorktreeById: () => undefined,
  createTab,
  clearSleepingAgentSession: vi.fn(),
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/agent-resume-launch-target', () => ({
  resolveAgentResumeLaunchTarget: () => ({ platform: 'darwin', shell: 'posix' }),
  resolveSshHostReportedPlatform: () => undefined
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({ getExecutionHostIdForWorktree: () => 'local' }))
vi.mock('@/lib/local-preflight-context', () => ({
  getLocalProjectExecutionRuntimeContext: () => undefined
}))
vi.mock('@/lib/telemetry', () => ({ tuiAgentToAgentKind: (agent: string) => agent }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function savedRecord(): SleepingAgentSessionRecord {
  const scope = captureLocalWorkspaceLaunchScope({
    workspaceId: 'workspace',
    projectId: 'project',
    defaultRootId: 'b',
    roots: [
      { id: 'a', label: 'A', path: '/original/a' },
      { id: 'b', label: 'B', path: '/original/b' }
    ]
  })
  const startup = buildAgentStartupPlan({
    agent: 'codex',
    platform: 'darwin',
    cmdOverrides: {},
    prompt: '',
    allowEmptyPromptLaunch: true,
    localWorkspaceScope: scope,
    agentArgs: localWorkspaceAgentArguments({ agent: 'codex', scope, shell: 'posix' })
  })
  return {
    paneKey: 'tab:leaf',
    worktreeId: 'folder:workspace',
    agent: 'codex',
    prompt: '',
    state: 'done',
    capturedAt: 1,
    updatedAt: 1,
    providerSession: { key: 'session_id', id: 'original-session' },
    launchConfig: sleepingAgentLaunchConfigSchema.parse(startup?.launchConfig)
  }
}

describe('Local Workspace sleeping resume', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores durable original roots, cwd and provider session after Project changes', () => {
    const record = savedRecord()
    expect(launchSleepingAgentSession(record)).toBe(true)
    expect(createTab).toHaveBeenCalledWith(
      'folder:workspace',
      undefined,
      undefined,
      expect.objectContaining({
        startupCwd: '/original/b',
        pendingStartup: expect.objectContaining({
          command: expect.stringContaining("'--add-dir' '/original/a'"),
          launchConfig: expect.objectContaining({
            localWorkspaceScope: record.launchConfig?.localWorkspaceScope
          }),
          resumeProviderSession: record.providerSession
        })
      })
    )
  })

  it('does not reconstruct lost or invalid launch roots from current Project settings', () => {
    const record = savedRecord()
    record.launchConfig = sleepingAgentLaunchConfigSchema.parse({
      ...record.launchConfig,
      localWorkspaceScope: { workspaceId: 'workspace' }
    })
    expect(launchSleepingAgentSession(record)).toBe(false)
    expect(createTab).not.toHaveBeenCalled()
    expect(store.clearSleepingAgentSession).not.toHaveBeenCalled()
  })
})
