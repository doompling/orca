import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../../shared/agent-session-resume'
import { captureLocalWorkspaceLaunchScope } from '../../../../../shared/local-projects/agent-launch-scope'
import { localWorkspaceAgentArguments } from '../../../../../shared/local-projects/agent-root-arguments'
import { buildAgentStartupPlan } from '../../../../../shared/tui-agent-startup'
import {
  bindBuildColdRestoreAgentResumeStartup,
  type ColdRestoreResumeSession
} from './cold-restore-resume-startup'

const store = {
  settings: { agentCmdOverrides: {}, agentDefaultArgs: {}, agentDefaultEnv: {} },
  agentStatusByPaneKey: {},
  getAgentLaunchConfigForStatusEntry: () => undefined
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/sleeping-record-execution-host-scope', () => ({
  agentResumeOriginNamesAnotherExecutionHost: () => false,
  sleepingRecordNamesAnotherExecutionHost: () => false
}))
vi.mock('@/lib/agent-resume-launch-target', () => ({
  resolveAgentResumeLaunchTarget: () => ({ platform: 'darwin', shell: 'posix' })
}))

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
    providerSession: { key: 'session_id', id: 'original-session' },
    prompt: '',
    state: 'done',
    capturedAt: 1,
    updatedAt: 1,
    launchConfig: startup?.launchConfig
  }
}

describe('Local Workspace cold resume', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the original provider session, complete roots and cwd rather than current pane path', () => {
    const record = savedRecord()
    const session: ColdRestoreResumeSession = {
      buildColdRestoreAgentResumeStartup: () => null,
      pendingStartupCommand: null,
      cacheKey: record.paneKey,
      getSleepingRecordForPane: () => ({ paneKey: record.paneKey, record }),
      executionHostId: 'local',
      projectRuntime: undefined,
      connectionId: undefined,
      worktree: undefined,
      shellOverride: undefined,
      deps: { worktreeId: record.worktreeId }
    }
    bindBuildColdRestoreAgentResumeStartup(session)
    const startup = session.buildColdRestoreAgentResumeStartup()
    expect(startup?.launchConfig.localWorkspaceScope).toEqual(
      record.launchConfig?.localWorkspaceScope
    )
    expect(startup?.command).toContain("'--cd' '/original/b'")
    expect(startup?.command).toContain("'--add-dir' '/original/a'")
    expect(startup?.command).toContain("'resume' 'original-session'")
  })
})
