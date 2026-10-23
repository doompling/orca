import { vi } from 'vitest'
import {
  createTestStore,
  makeOpenFile,
  makeTab,
  makeTabGroup,
  makeUnifiedTab
} from '@/store/slices/store-test-helpers'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { projectLocalFolderWorkspaces } from '../../../../shared/local-projects/folder-projection'

export function fileLayoutFixture() {
  const catalog: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'App',
        roots: [
          { id: 'a', label: 'A', path: '/a' },
          { id: 'b', label: 'B', path: '/b' }
        ],
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: ['main', 'copy'].map((id) => ({
      id,
      name: id,
      projectId: 'project',
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }))
  }
  const sourceKey = 'folder:main'
  const targetKey = 'folder:copy'
  const files = ['a', 'c', 'b'].map((id) =>
    makeOpenFile({
      id: `file-${id}`,
      worktreeId: sourceKey,
      filePath: `/${id === 'b' ? 'b' : 'a'}/${id}.txt`,
      relativePath: `${id}.txt`,
      lastKnownDiskSignature: 'source-signature'
    })
  )
  const tabs = files.map((file) =>
    makeUnifiedTab({
      id: `tab-${file.id}`,
      entityId: file.id,
      worktreeId: sourceKey,
      groupId: file.id === 'file-b' ? 'right' : 'left',
      contentType: 'editor'
    })
  )
  tabs.push(
    makeUnifiedTab({
      id: 'terminal',
      entityId: 'terminal',
      worktreeId: sourceKey,
      groupId: 'left',
      contentType: 'terminal',
      agentSessionAgent: 'codex'
    })
  )
  const store = createTestStore()
  store.setState({
    localProjects: catalog,
    folderWorkspaces: projectLocalFolderWorkspaces(catalog),
    openFiles: files,
    unifiedTabsByWorktree: { [sourceKey]: tabs },
    groupsByWorktree: {
      [sourceKey]: [
        makeTabGroup({
          id: 'left',
          worktreeId: sourceKey,
          activeTabId: tabs[0].id,
          tabOrder: [tabs[1].id, tabs[0].id, 'terminal']
        }),
        makeTabGroup({
          id: 'right',
          worktreeId: sourceKey,
          activeTabId: tabs[2].id,
          tabOrder: [tabs[2].id]
        })
      ]
    },
    layoutByWorktree: {
      [sourceKey]: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.35,
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    },
    activeGroupIdByWorktree: { [sourceKey]: 'right' },
    activeWorktreeId: sourceKey,
    activeWorkspaceKey: sourceKey,
    activeWorkspaceExecutionHostId: 'local',
    activeFileId: files[2].id,
    activeTabType: 'editor',
    tabsByWorktree: {
      [sourceKey]: [makeTab({ id: 'terminal', worktreeId: sourceKey, ptyId: 'source-pty' })]
    },
    editorDrafts: {},
    recordFeatureInteraction: vi.fn(),
    fetchFolderWorkspacesForAllHosts: vi.fn(async () => {})
  })
  const api = {
    createWorkspace: vi.fn(async () => catalog.workspaces[1]),
    getSnapshot: vi.fn(async () => structuredClone(catalog)),
    updateProject: vi.fn(async () => catalog.projects[0])
  }
  vi.stubGlobal('window', { api: { localProjects: api } })
  return { store, catalog, sourceKey, targetKey, api }
}
