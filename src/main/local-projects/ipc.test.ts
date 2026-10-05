import { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProject, LocalWorkspace } from '../../shared/local-projects/types'
import { registerLocalProjectHandlers } from './ipc'

const { handlers, changed, createWorktree, linkIssue } = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, ...args: unknown[]) => unknown>(),
  changed: vi.fn(),
  createWorktree: vi.fn(async () => ({ path: '/feature' })),
  linkIssue: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: {
    handle: (channel: string, handler: (_event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel)
  }
}))
vi.mock('../ipc/repos/repos-changed-notification', () => ({ notifyReposChanged: changed }))
vi.mock('./root-worktree-creation', () => ({ createLocalRootWorktree: createWorktree }))
vi.mock('./linear-issue-linking', () => ({ linkLocalWorkspaceLinearIssue: linkIssue }))

const workspace: LocalWorkspace = {
  id: 'workspace',
  projectId: 'project',
  name: 'Main',
  checkoutOverridesByRootId: {},
  isArchived: false,
  createdAt: 1,
  updatedAt: 1
}
const project: LocalProject = {
  id: 'project',
  name: 'Application',
  roots: [{ id: 'root', label: 'Root', path: '/source' }],
  defaultRootId: 'root',
  lastWorkspaceId: 'workspace',
  isArchived: false,
  createdAt: 1,
  updatedAt: 1
}

function register() {
  const store = {
    getLocalProjectsSnapshot: vi.fn(() => ({
      version: 1 as const,
      projects: [project],
      workspaces: [workspace]
    })),
    createLocalProject: vi.fn(async () => ({ project, workspace })),
    createLocalWorkspace: vi.fn(async () => workspace),
    resolveLocalWorkspace: vi.fn(() => null),
    updateLocalProject: vi.fn(() => project),
    updateLocalWorkspace: vi.fn(() => workspace),
    attachLocalWorkspaceLinearIssue: vi.fn(() => workspace),
    detachLocalWorkspaceLinearIssue: vi.fn(() => workspace),
    updateLocalProjectRoots: vi.fn(async () => ({
      version: 1 as const,
      projects: [project],
      workspaces: [workspace]
    })),
    updateLocalWorkspaceCheckouts: vi.fn(async () => ({
      version: 1 as const,
      projects: [project],
      workspaces: [workspace]
    }))
  }
  registerLocalProjectHandlers(new BrowserWindow(), store, {
    acquireWorktreeTerminalMutation: vi.fn(async () => () => {}),
    listTerminals: vi.fn(async () => ({ terminals: [], totalCount: 0, truncated: false }))
  })
  return store
}

function call(channel: string, value?: unknown): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`)
  }
  return handler({}, value)
}

beforeEach(() => {
  handlers.clear()
  changed.mockReset()
  createWorktree.mockClear()
  linkIssue.mockReset().mockResolvedValue(workspace)
})

describe('desktop local Project IPC', () => {
  it('registers one validated route per typed API operation', async () => {
    const store = register()
    expect(handlers.size).toBe(11)
    expect(call('localProjects:getSnapshot')).toEqual(store.getLocalProjectsSnapshot())
    const input = {
      name: 'Application',
      roots: [{ id: 'root', path: '/source' }],
      defaultRootId: 'root'
    }
    await expect(call('localProjects:createProject', input)).resolves.toEqual({
      project,
      workspace
    })
    expect(store.createLocalProject).toHaveBeenCalledWith(input)
    expect(changed).toHaveBeenCalledOnce()
    expect(() =>
      call('localProjects:updateWorkspace', {
        workspaceId: 'workspace',
        updates: { folderPath: '/elsewhere' }
      })
    ).toThrow()
    expect(store.updateLocalWorkspace).not.toHaveBeenCalled()
  })

  it('does not publish creation when persistence fails', async () => {
    const store = register()
    store.createLocalProject.mockRejectedValueOnce(new Error('disk full'))
    await expect(
      call('localProjects:createProject', {
        name: 'Application',
        roots: [{ path: '/source' }]
      })
    ).rejects.toThrow('disk full')
    expect(changed).not.toHaveBeenCalled()
  })

  it('creates a checkout explicitly without publishing a Workspace or accepting remote options', async () => {
    const store = register()
    const request = {
      projectId: 'project',
      rootId: 'root',
      expectedRootPath: '/source',
      path: '/feature',
      branchName: 'feature'
    }
    await expect(call('localProjects:createRootWorktree', request)).resolves.toEqual({
      path: '/feature'
    })
    expect(createWorktree).toHaveBeenCalledExactlyOnceWith(store, request)
    expect(store.createLocalWorkspace).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    expect(() =>
      call('localProjects:createRootWorktree', { ...request, connectionId: 'ssh' })
    ).toThrow()
    expect(createWorktree).toHaveBeenCalledOnce()
  })

  it('passes checked scope edits to the single Store owner with a host guard', async () => {
    const store = register()
    const request = {
      projectId: project.id,
      expected: { roots: project.roots, defaultRootId: 'root' },
      roots: project.roots,
      defaultRootId: 'root'
    }
    await call('localProjects:updateProjectRoots', request)
    expect(store.updateLocalProjectRoots).toHaveBeenCalledWith(request, expect.any(Function))
    expect(changed).toHaveBeenCalledOnce()
    await expect(
      call('localProjects:updateProjectRoots', { ...request, connectionId: 'ssh' })
    ).rejects.toThrow()
    expect(store.updateLocalProjectRoots).toHaveBeenCalledOnce()
  })

  it('verifies issue links in main and only publishes after successful persistence', async () => {
    const store = register()
    const input = { workspaceId: workspace.id, linearWorkspaceId: 'account', issueId: 'issue' }
    await expect(call('localProjects:attachLinearIssue', input)).resolves.toEqual(workspace)
    expect(linkIssue).toHaveBeenCalledExactlyOnceWith(store, input)
    expect(changed).toHaveBeenCalledOnce()
    await expect(
      call('localProjects:attachLinearIssue', { ...input, title: 'unverified' })
    ).rejects.toThrow()
    await expect(
      call('localProjects:attachLinearIssue', { ...input, connectionId: 'remote' })
    ).rejects.toThrow()
    expect(linkIssue).toHaveBeenCalledOnce()
    changed.mockClear()
    linkIssue.mockRejectedValueOnce(new Error('offline'))
    await expect(call('localProjects:attachLinearIssue', input)).rejects.toThrow('offline')
    expect(changed).not.toHaveBeenCalled()
  })

  it('detaches an exact local issue without reading Linear', () => {
    const store = register()
    const input = { workspaceId: workspace.id, organizationId: 'org', issueId: 'issue' }
    expect(call('localProjects:detachLinearIssue', input)).toEqual(workspace)
    expect(store.detachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith(input)
    expect(linkIssue).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledOnce()
    expect(() =>
      call('localProjects:detachLinearIssue', { ...input, connectionId: 'ssh' })
    ).toThrow()
    expect(store.detachLocalWorkspaceLinearIssue).toHaveBeenCalledOnce()
  })

  it('passes only the exact issue selection into atomic Workspace creation', async () => {
    const store = register()
    const input = {
      projectId: project.id,
      name: 'ENG-1 Work',
      linearIssue: { linearWorkspaceId: 'account', issueId: 'uuid' }
    }
    await expect(call('localProjects:createWorkspace', input)).resolves.toEqual(workspace)
    expect(store.createLocalWorkspace).toHaveBeenCalledExactlyOnceWith(input)
    for (const linearIssue of [
      { ...input.linearIssue, title: 'unverified' },
      { ...input.linearIssue, connectionId: 'remote' },
      { ...input.linearIssue, linearWorkspaceId: 'all' }
    ]) {
      await expect(
        call('localProjects:createWorkspace', { ...input, linearIssue })
      ).rejects.toThrow()
    }
    expect(store.createLocalWorkspace).toHaveBeenCalledOnce()
  })
})
