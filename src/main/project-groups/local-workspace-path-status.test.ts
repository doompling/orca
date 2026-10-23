import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedLocalWorkspace } from '../../shared/local-projects/types'
import { getFolderWorkspacePathStatus } from './folder-workspace-path-status'

function workspace(path: string): ResolvedLocalWorkspace {
  return {
    workspaceId: 'workspace',
    projectId: 'project',
    defaultRootId: 'second',
    roots: [
      { id: 'first', label: 'First', path: join(path, 'missing-first') },
      { id: 'second', label: 'Second', path }
    ]
  }
}

describe('Local Workspace native path status', () => {
  it('uses the declared native root without inferring an overlapping SSH owner', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-local-workspace-'))
    const getRepos = vi.fn(() => [
      {
        id: 'remote-repo',
        path: join(root, 'nested'),
        displayName: 'Remote',
        badgeColor: 'gray',
        addedAt: 1,
        connectionId: 'ssh-target'
      }
    ])
    try {
      await expect(
        getFolderWorkspacePathStatus(
          { getRepos, resolveLocalWorkspace: () => workspace(root) },
          { scope: 'folder-workspace', folderWorkspaceId: 'workspace' }
        )
      ).resolves.toEqual({ path: root, exists: true })
      expect(getRepos).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not substitute another root when the declared default is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-local-workspace-'))
    const resolved = workspace(root)
    resolved.defaultRootId = 'first'
    try {
      await expect(
        getFolderWorkspacePathStatus(
          { getRepos: () => [], resolveLocalWorkspace: () => resolved },
          { scope: 'folder-workspace', folderWorkspaceId: 'workspace' }
        )
      ).resolves.toEqual({ path: join(root, 'missing-first'), exists: false, reason: 'missing' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a malformed default instead of choosing the first root', async () => {
    const resolved = workspace(tmpdir())
    resolved.defaultRootId = 'unknown'
    await expect(
      getFolderWorkspacePathStatus(
        { getRepos: () => [], resolveLocalWorkspace: () => resolved },
        { scope: 'folder-workspace', folderWorkspaceId: 'workspace' }
      )
    ).rejects.toThrow('Local Workspace default root is unavailable.')
  })
})
