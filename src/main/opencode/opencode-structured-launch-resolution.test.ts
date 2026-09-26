import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import {
  captureOpenCodeAccountHome,
  pinnedOpenCodeEnvironment
} from './opencode-structured-account-home'
import {
  createOpenCodeStructuredLaunchResolver,
  openCodeWorkspacePermissionRules
} from './opencode-structured-launch-resolution'

vi.mock('../local-projects/structured-agent-scope', () => ({
  readStructuredLocalWorkspaceScope: async (record: AgentSessionRecord) =>
    record.localWorkspaceScope
}))

const identity: AgentSessionJournalIdentity = {
  sessionId: 'opencode_fixture',
  workspaceId: 'folder:workspace',
  hostId: 'local',
  agent: 'opencode',
  providerHandle: { kind: 'opencode', sessionId: 'ses_saved' }
}
const scope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace',
  projectId: 'project',
  defaultRootId: 'a',
  roots: [
    { id: 'a', label: 'App A', path: '/work/app_a' },
    { id: 'b', label: 'App B', path: '/work/app_b' }
  ]
})

function record(): AgentSessionRecord {
  return {
    ...agentSessionRecordFixture(),
    sessionId: identity.sessionId,
    provider: 'opencode',
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceKind: 'folder',
      workspaceId: identity.workspaceId
    },
    accountHome: {
      variable: 'XDG_DATA_HOME',
      path: '/accounts/data',
      configHome: '/accounts/config'
    },
    providerHandleChain: [],
    localWorkspaceScope: scope
  }
}

function resolver(value: AgentSessionRecord) {
  return createOpenCodeStructuredLaunchResolver({
    store: { getRecord: () => value },
    resolveWorkspacePath: async () => '/legacy/workspace',
    resolveEnvironment: async () => ({
      PATH: '/bin',
      XDG_DATA_HOME: '/unrelated/data',
      OPENCODE_CONFIG: '/unrelated/config.json'
    }),
    resolveCommand: () => 'opencode'
  })
}

describe('OpenCode launch scope', () => {
  it('pins account directories and provides every root without changing cwd to their parent', async () => {
    const launch = await resolver(record())({ identity })
    expect(launch.cwd).toBe('/work/app_a')
    expect(launch.env.XDG_DATA_HOME).toBe('/accounts/data')
    expect(launch.env.XDG_CONFIG_HOME).toBe('/accounts/config')
    expect(launch.env).not.toHaveProperty('OPENCODE_CONFIG')
    expect(launch.envToDelete).toContain('OPENCODE_CONFIG')
    expect(launch.localWorkspaceScope).toEqual(scope)
    expect(launch.permissionRules).toContainEqual({ permission: '*', pattern: '*', action: 'ask' })
    expect(launch.permissionRules).toContainEqual({
      permission: 'external_directory',
      pattern: '/work/app_b/*',
      action: 'allow'
    })
    expect(launch.permissionRules).not.toContainEqual({
      permission: 'external_directory',
      pattern: '/work/*',
      action: 'allow'
    })
  })

  it('resumes the durable provider ID and supports ordinary folder/worktree launches', async () => {
    const value = record()
    delete value.localWorkspaceScope
    value.providerHandleChain = [
      {
        linkId: 'link-saved',
        mintedAtFence: 1,
        observedAt: 1,
        origin: 'created',
        handle: { provider: 'opencode', sessionId: 'ses_saved' }
      }
    ]
    const launch = await resolver(value)({ identity })
    expect(launch.resumeSessionId).toBe('ses_saved')
    expect(launch.cwd).toBe('/legacy/workspace')
  })

  it('refuses remote and WSL execution before resolving a local process', async () => {
    for (const location of [
      { ...record().location, executionHostId: 'ssh:elsewhere' as const },
      { ...record().location, wslDistro: 'Ubuntu' }
    ]) {
      await expect(resolver({ ...record(), location })({ identity })).rejects.toThrow(
        'native local'
      )
    }
  })

  it('refuses permission wildcard paths instead of broadening their grants', () => {
    expect(() => openCodeWorkspacePermissionRules(['/work/*'])).toThrow('cannot safely grant')
    expect(() => openCodeWorkspacePermissionRules(['/work/a?b'])).toThrow('cannot safely grant')
  })
})

describe('OpenCode account pinning', () => {
  it('uses the same default XDG roots as the existing CLI integration', () => {
    expect(captureOpenCodeAccountHome({}, '/work', '/user')).toEqual({
      variable: 'XDG_DATA_HOME',
      path: '/user/.local/share',
      configHome: '/user/.config'
    })
  })

  it('freezes explicit config paths without persisting credential values', () => {
    const account = captureOpenCodeAccountHome(
      {
        XDG_DATA_HOME: '/account/data',
        XDG_CONFIG_HOME: '/account/config',
        OPENCODE_CONFIG: './opencode.json',
        OPENCODE_CONFIG_DIR: './config',
        OPENAI_API_KEY: 'test-only-do-not-persist'
      },
      '/work',
      '/user'
    )
    expect(account).toEqual({
      variable: 'XDG_DATA_HOME',
      path: '/account/data',
      configHome: '/account/config',
      configFile: '/work/opencode.json',
      configDir: '/work/config'
    })
    expect(pinnedOpenCodeEnvironment(account, {}).env).toMatchObject({
      OPENCODE_CONFIG: '/work/opencode.json',
      OPENCODE_CONFIG_DIR: '/work/config'
    })
  })
})
