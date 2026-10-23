import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedLocalWorkspace } from '../../../../shared/local-projects/types'
import type { Store } from '../../../persistence'
import { assertFolderWorkspacePtyPathUsable, resolvePtySpawnStartupCwd } from './spawn-cwd'
import { captureLocalWorkspaceLaunchScope } from '../../../../shared/local-projects/agent-launch-scope'

const workspace: ResolvedLocalWorkspace = {
  workspaceId: 'workspace',
  projectId: 'project',
  defaultRootId: 'second',
  roots: [
    { id: 'first', label: 'App A', path: '/code/app-a' },
    { id: 'second', label: 'App B', path: '/code/app-b' }
  ]
}

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these tests exercise only getFolderWorkspace and resolveLocalWorkspace.
const store = {
  getFolderWorkspace: () => undefined,
  resolveLocalWorkspace: (id: string) => (id === workspace.workspaceId ? workspace : null)
} as unknown as Store

describe('Local Workspace terminal cwd', () => {
  it('uses the declared default, never array order, when no cwd is provided', () => {
    expect(resolvePtySpawnStartupCwd(store, 'folder:workspace', undefined)).toBe('/code/app-b')
  })

  it('preserves an explicitly selected sibling root', () => {
    expect(resolvePtySpawnStartupCwd(store, 'folder:workspace', '/code/app-a')).toBe('/code/app-a')
  })

  it('anchors relative cwd to the declared default', () => {
    expect(resolvePtySpawnStartupCwd(store, 'folder:workspace', 'src')).toBe('/code/app-b/src')
  })

  it('does not fallback from an unavailable saved cwd to a different root', () => {
    const directoryExists = vi.fn((path: string) => path === '/code/app-b')
    const onFallbackToWorkspaceRoot = vi.fn()
    expect(
      resolvePtySpawnStartupCwd(store, 'folder:workspace', '/code/app-a', {
        directoryExists,
        onFallbackToWorkspaceRoot
      })
    ).toBe('/code/app-a')
    expect(directoryExists).not.toHaveBeenCalled()
    expect(onFallbackToWorkspaceRoot).not.toHaveBeenCalled()
  })

  it('preserves ordinary worktree fallback behavior', () => {
    expect(
      resolvePtySpawnStartupCwd(store, 'repo::/code/legacy', '/code/missing', {
        directoryExists: (path) => path === '/code/legacy'
      })
    ).toBe('/code/legacy')
  })

  it('checks every frozen root before a fresh agent spawn, even after model edits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-agent-roots-'))
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    const scope = captureLocalWorkspaceLaunchScope({
      ...workspace,
      roots: [
        { id: 'first', label: 'A', path: first },
        { id: 'second', label: 'B', path: second }
      ]
    })
    const launch = {
      cwd: second,
      launchConfig: { agentArgs: '', agentEnv: {}, localWorkspaceScope: scope }
    }
    try {
      await mkdir(first)
      await mkdir(second)
      await expect(
        assertFolderWorkspacePtyPathUsable(undefined, 'folder:workspace', launch)
      ).resolves.toBeUndefined()
      await rm(first, { recursive: true })
      await expect(
        assertFolderWorkspacePtyPathUsable(undefined, 'folder:workspace', launch)
      ).rejects.toThrow('folder_workspace_path_missing:')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('refuses another Workspace or remote host before directory checks', () => {
    const scope = captureLocalWorkspaceLaunchScope(workspace)
    const launch = {
      cwd: scope.cwd,
      launchConfig: { agentArgs: '', agentEnv: {}, localWorkspaceScope: scope }
    }
    expect(() => assertFolderWorkspacePtyPathUsable(undefined, 'folder:other', launch)).toThrow(
      'different Workspace'
    )
    expect(() =>
      assertFolderWorkspacePtyPathUsable(undefined, 'folder:workspace', {
        ...launch,
        connectionId: 'ssh-target'
      })
    ).toThrow('different Workspace')
    expect(() =>
      assertFolderWorkspacePtyPathUsable(undefined, 'folder:workspace', {
        ...launch,
        cwd: '/other'
      })
    ).toThrow('cwd does not match')
  })
})
