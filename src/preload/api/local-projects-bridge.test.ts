import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localProjectsApi } from './local-projects-bridge'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }))
vi.mock('electron', () => ({ ipcRenderer: { invoke } }))

beforeEach(() => invoke.mockClear())

describe('local Project desktop bridge', () => {
  it('uses the explicit desktop channels without falling through to runtime RPC', async () => {
    const project = { name: 'Application', roots: [{ path: '/source' }] }
    await localProjectsApi.getSnapshot()
    await localProjectsApi.createProject(project)
    await localProjectsApi.createWorkspace({ projectId: 'project', name: 'Task' })
    await localProjectsApi.resolveWorkspace('workspace')
    await localProjectsApi.updateProject({ projectId: 'project', updates: { name: 'Renamed' } })
    await localProjectsApi.updateWorkspace({
      workspaceId: 'workspace',
      updates: { isArchived: true }
    })
    expect(invoke.mock.calls).toEqual([
      ['localProjects:getSnapshot'],
      ['localProjects:createProject', project],
      ['localProjects:createWorkspace', { projectId: 'project', name: 'Task' }],
      ['localProjects:resolveWorkspace', 'workspace'],
      ['localProjects:updateProject', { projectId: 'project', updates: { name: 'Renamed' } }],
      ['localProjects:updateWorkspace', { workspaceId: 'workspace', updates: { isArchived: true } }]
    ])
  })

  it('keeps exact scope-edit snapshots on the two desktop mutation routes', async () => {
    const roots = [{ id: 'root', label: 'Root', path: '/source' }]
    const project = {
      projectId: 'project',
      roots,
      defaultRootId: 'root',
      expected: { roots, defaultRootId: 'root' }
    }
    const workspace = {
      workspaceId: 'workspace',
      expected: {
        projectRoots: roots,
        projectDefaultRootId: 'root',
        checkoutOverridesByRootId: {},
        defaultRootId: null
      },
      checkoutOverridesByRootId: { root: '/alternate' },
      defaultRootId: null
    }
    await localProjectsApi.updateProjectRoots(project)
    await localProjectsApi.updateWorkspaceCheckouts(workspace)
    expect(invoke.mock.calls).toEqual([
      ['localProjects:updateProjectRoots', project],
      ['localProjects:updateWorkspaceCheckouts', workspace]
    ])
  })

  it('keeps worktree creation separate from Workspace persistence', async () => {
    const request = {
      projectId: 'project',
      rootId: 'root',
      expectedRootPath: '/source',
      path: '/feature',
      branchName: 'feature'
    }
    await localProjectsApi.createRootWorktree(request)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('localProjects:createRootWorktree', request)
  })
})
