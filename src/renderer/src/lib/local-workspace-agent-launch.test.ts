import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { LocalProjectsState } from '../../../shared/local-projects/types'
import {
  allowLocalWorkspaceAgentRoute,
  prepareLocalWorkspaceAgentLaunch
} from './local-workspace-agent-launch'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const localProjects: LocalProjectsState = {
  version: 1,
  projects: [
    {
      id: 'project',
      name: 'Project',
      roots: [
        { id: 'a', label: 'App A', path: '/code/a' },
        { id: 'b', label: 'App B', path: '/code/b' }
      ],
      defaultRootId: 'b',
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

describe('Local Workspace agent launch routing', () => {
  it.each(['codex', 'claude'] as const)('prepares complete scope for %s terminal mode', (agent) => {
    const launch = prepareLocalWorkspaceAgentLaunch({
      localProjects,
      worktreeId: 'folder:workspace',
      agent,
      prompt: 'Task',
      platform: 'darwin',
      isRemote: false
    })
    expect(launch.kind).toBe('local')
    if (launch.kind !== 'local') {
      throw new Error('Expected a local launch')
    }
    expect(launch.scope.cwd).toBe('/code/b')
    expect(launch.scope.roots).toHaveLength(2)
    expect(launch.prompt).toContain('App A')
    expect(launch.prompt).toContain('App B')
    expect(launch.prompt).toContain('Task')
    expect(allowLocalWorkspaceAgentRoute(launch, 'terminal-tui')).toBe(true)
    expect(allowLocalWorkspaceAgentRoute(launch, 'structured-native-chat')).toBe(true)
  })

  it.each(['host-published'] as const)(
    'refuses unadapted %s mode rather than narrowing the scope',
    (route) => {
      const launch = prepareLocalWorkspaceAgentLaunch({
        localProjects,
        worktreeId: 'folder:workspace',
        agent: 'codex',
        prompt: '',
        platform: 'darwin',
        isRemote: false
      })
      expect(allowLocalWorkspaceAgentRoute(launch, route)).toBe(false)
      expect(toast.error).toHaveBeenCalled()
    }
  )

  it('refuses an unadapted provider and remote launch', () => {
    for (const request of [
      { agent: 'gemini', isRemote: false },
      { agent: 'codex', isRemote: true }
    ] as const) {
      const launch = prepareLocalWorkspaceAgentLaunch({
        localProjects,
        worktreeId: 'folder:workspace',
        prompt: '',
        platform: 'darwin',
        ...request
      })
      expect(allowLocalWorkspaceAgentRoute(launch, 'terminal-tui')).toBe(false)
    }
  })

  it('leaves existing non-fork agent routes unchanged', () => {
    const launch = prepareLocalWorkspaceAgentLaunch({
      localProjects,
      worktreeId: 'repo::/code/legacy',
      agent: 'gemini',
      prompt: '',
      platform: 'darwin',
      isRemote: true
    })
    expect(launch).toEqual({ kind: 'legacy' })
    expect(allowLocalWorkspaceAgentRoute(launch, 'host-published')).toBe(true)
  })
})
