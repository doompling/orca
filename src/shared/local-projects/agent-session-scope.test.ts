import { describe, expect, it } from 'vitest'
import type { AgentSessionExecutionLocation } from '../agent-session-record'
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

describe('durable multi-root session scope', () => {
  it('accepts no scope, or only the matching local Workspace owner', () => {
    expect(isLocalWorkspaceSessionScope(undefined, location)).toBe(true)
    expect(isLocalWorkspaceSessionScope(scope, location)).toBe(true)
  })

  it.each([
    { ...location, executionHostId: 'ssh:another-host' as const },
    { ...location, wslDistro: 'Ubuntu' },
    { ...location, workspaceId: 'folder:workspace-b' },
    { ...location, workspaceKind: 'git-worktree' as const }
  ])('refuses a saved scope under another owner: %j', (otherLocation) => {
    expect(isLocalWorkspaceSessionScope(scope, otherLocation)).toBe(false)
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
