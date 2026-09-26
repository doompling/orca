import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import type { ResolvedLocalWorkspace } from '../../shared/local-projects/types'
import {
  captureStructuredLocalWorkspaceScope,
  readStructuredLocalWorkspaceScope
} from './structured-agent-scope'

const location: AgentSessionExecutionLocation = {
  executionHostId: 'local',
  wslDistro: null,
  workspaceId: 'folder:workspace-a',
  workspaceKind: 'folder'
}
let directory: string
let workspace: ResolvedLocalWorkspace

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-chat-roots-'))
  workspace = {
    workspaceId: 'workspace-a',
    projectId: 'project',
    defaultRootId: 'b',
    roots: [
      { id: 'a', label: 'App A', path: join(directory, 'app-a') },
      { id: 'b', label: 'App B', path: join(directory, 'app-b') }
    ]
  }
  await Promise.all(workspace.roots.map((root) => mkdir(root.path)))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('host-owned structured agent roots', () => {
  it('captures all authoritative roots and the chosen default without sharing catalog objects', () => {
    const resolveLocalWorkspace = vi.fn(() => workspace)
    const snapshot = captureStructuredLocalWorkspaceScope({ resolveLocalWorkspace }, location)
    expect(resolveLocalWorkspace).toHaveBeenCalledWith('workspace-a')
    expect(snapshot?.cwd).toBe(join(directory, 'app-b'))
    expect(snapshot?.roots).toEqual(workspace.roots)
    workspace.roots[0].path = join(directory, 'new-checkout')
    expect(snapshot?.roots[0].path).toBe(join(directory, 'app-a'))
  })

  it.each([
    { ...location, executionHostId: 'ssh:another-host' as const },
    { ...location, wslDistro: 'Ubuntu' },
    { ...location, workspaceKind: 'git-worktree' as const }
  ])('does not reinterpret legacy or remote contexts: %j', (otherLocation) => {
    const resolveLocalWorkspace = vi.fn(() => workspace)
    expect(captureStructuredLocalWorkspaceScope({ resolveLocalWorkspace }, otherLocation)).toBe(
      undefined
    )
    expect(resolveLocalWorkspace).not.toHaveBeenCalled()
  })

  it('leaves existing folder workspaces without a fork record unchanged', async () => {
    expect(captureStructuredLocalWorkspaceScope({}, location)).toBeUndefined()
    await expect(readStructuredLocalWorkspaceScope({ location })).resolves.toBeUndefined()
  })

  it('returns an independent snapshot after validating every saved directory', async () => {
    const localWorkspaceScope = captureLocalWorkspaceLaunchScope(workspace)
    const read = await readStructuredLocalWorkspaceScope({ location, localWorkspaceScope })
    expect(read).toEqual(localWorkspaceScope)
    expect(read?.roots).not.toBe(localWorkspaceScope.roots)
  })

  it('refuses a missing secondary root even when the default cwd still exists', async () => {
    const localWorkspaceScope = captureLocalWorkspaceLaunchScope(workspace)
    localWorkspaceScope.roots[0].path = join(directory, 'missing')
    await expect(
      readStructuredLocalWorkspaceScope({ location, localWorkspaceScope })
    ).rejects.toThrow('folder_workspace_path_missing')
  })

  it('refuses a secondary root that has become a file', async () => {
    const localWorkspaceScope = captureLocalWorkspaceLaunchScope(workspace)
    const file = join(directory, 'not-a-directory')
    await writeFile(file, 'not a folder')
    localWorkspaceScope.roots[0].path = file
    await expect(
      readStructuredLocalWorkspaceScope({ location, localWorkspaceScope })
    ).rejects.toThrow('folder_workspace_path_not_directory')
  })

  it('refuses a valid saved scope attached to another execution host', async () => {
    await expect(
      readStructuredLocalWorkspaceScope({
        location: { ...location, executionHostId: 'ssh:another-host' },
        localWorkspaceScope: captureLocalWorkspaceLaunchScope(workspace)
      })
    ).rejects.toThrow('another execution host')
  })
})
