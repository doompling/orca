import { describe, expect, it, vi } from 'vitest'
import { RuntimeProjectGroupController } from './runtime-project-group-controller'

describe('RuntimeProjectGroupController.deleteFolderWorkspace for local Workspaces', () => {
  it('refuses legacy deletion of a local Workspace before process or session teardown', async () => {
    const removeFolderWorkspace = vi.fn(() => true)
    const resolveFolderConnectionId = vi.fn(() => null)
    const teardownFolderWorkspacePtys = vi.fn(async () => undefined)
    const cleanupRemovedFolderWorkspaceState = vi.fn()
    const notifyReposChanged = vi.fn()
    const store = {
      getFolderWorkspaces: () => [{ id: 'ws-1', projectGroupId: 'group-1', folderPath: '/tmp/ws' }],
      removeFolderWorkspace,
      resolveLocalWorkspace: () => ({
        workspaceId: 'ws-1',
        projectId: 'project',
        defaultRootId: 'root',
        roots: [{ id: 'root', label: 'Root', path: '/tmp/ws' }]
      })
    }
    const controller = new RuntimeProjectGroupController({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: deleteFolderWorkspace reads only these Store members.
      getStore: () => store as never,
      resolveRepo: async () => {
        throw new Error('unused')
      },
      notifyReposChanged,
      resolveFolderConnectionId,
      teardownFolderWorkspacePtys,
      cleanupRemovedFolderWorkspaceState,
      emitWorktreeLifecycle: vi.fn()
    })

    await expect(controller.deleteFolderWorkspace('ws-1')).rejects.toThrow('Archive')
    expect(resolveFolderConnectionId).not.toHaveBeenCalled()
    expect(teardownFolderWorkspacePtys).not.toHaveBeenCalled()
    expect(cleanupRemovedFolderWorkspaceState).not.toHaveBeenCalled()
    expect(removeFolderWorkspace).not.toHaveBeenCalled()
    expect(notifyReposChanged).not.toHaveBeenCalled()
  })
})
