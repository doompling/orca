import { describe, expect, it } from 'vitest'
import {
  isPersistedAgentSessionRecord,
  type AgentSessionExecutionLocation
} from '../agent-session-record'
import { agentSessionRecordFixture } from '../agent-session-record.test-fixture'
import { encodeAgentSessionRecord } from '../agent-session-record-stored-form'
import { captureLocalWorkspaceLaunchScope } from './agent-launch-scope'
import { isLocalWorkspaceSessionScope } from './agent-session-scope'

const scope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace-a',
  projectId: 'project',
  defaultRootId: 'b',
  roots: [
    { id: 'a', label: 'App A', path: '/code/app-a' },
    { id: 'b', label: 'App B', path: '/code/app-b' }
  ]
})
const location: AgentSessionExecutionLocation = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'folder:workspace-a',
  workspaceKind: 'folder'
}

const storedRecord = () => encodeAgentSessionRecord(agentSessionRecordFixture())

describe('durable multi-root session scope', () => {
  it('keeps legacy records valid without adding a scope', () => {
    expect(isPersistedAgentSessionRecord(storedRecord())).toBe(true)
    expect(isLocalWorkspaceSessionScope(undefined, location)).toBe(true)
  })

  it('accepts only the matching local Workspace owner', () => {
    expect(isLocalWorkspaceSessionScope(scope, location)).toBe(true)
    expect(
      isPersistedAgentSessionRecord({ ...storedRecord(), location, localWorkspaceScope: scope })
    ).toBe(true)
  })

  it.each([
    { ...location, executionHostId: 'ssh:another-host' as const },
    { ...location, wslDistro: 'Ubuntu' },
    { ...location, workspaceId: 'folder:workspace-b' },
    { ...location, workspaceKind: 'git-worktree' as const }
  ])('refuses a saved scope under another owner: %j', (otherLocation) => {
    expect(isLocalWorkspaceSessionScope(scope, otherLocation)).toBe(false)
    expect(
      isPersistedAgentSessionRecord({
        ...storedRecord(),
        location: otherLocation,
        localWorkspaceScope: scope
      })
    ).toBe(false)
  })

  it.each([
    { ...scope, roots: [] },
    { ...scope, cwd: '/outside' },
    { ...scope, defaultRootId: 'missing' },
    { ...scope, roots: [{ id: 'b', label: 'Relative', path: 'relative/path' }] },
    { ...scope, roots: [{ id: 'b', label: 'WSL', path: '\\\\wsl.localhost\\Ubuntu\\home' }] }
  ])('refuses a malformed frozen scope: %j', (malformed) => {
    expect(isLocalWorkspaceSessionScope(malformed, location)).toBe(false)
  })
})
