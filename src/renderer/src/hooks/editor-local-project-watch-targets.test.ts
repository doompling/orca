import { describe, expect, it } from 'vitest'
import type { LocalProjectsState } from '../../../shared/local-projects/types'
import { projectLocalFolderWorkspaces } from '../../../shared/local-projects/folder-projection'
import {
  selectEditorExternalWatchTargets,
  type EditorExternalWatchTargetState
} from './editor-external-watch-targets'
import { getWorktreeVisitKey } from '@/lib/worktree-visit-recency'

function fixture(): EditorExternalWatchTargetState & { localProjects: LocalProjectsState } {
  const localProjects: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Full application',
        roots: [
          { id: 'a', label: 'App A', path: '/app_a' },
          { id: 'b', label: 'App B', path: '/app_b' }
        ],
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: ['first', 'second'].map((id) => ({
      id,
      projectId: 'project',
      name: id,
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }))
  }
  return {
    localProjects,
    folderWorkspaces: projectLocalFolderWorkspaces(localProjects),
    projectGroups: [],
    repos: [],
    worktreesByRepo: {},
    openFiles: [
      {
        id: 'second-file',
        worktreeId: 'folder:second',
        filePath: '/app_b/shared.ts',
        relativePath: 'shared.ts',
        mode: 'edit',
        language: 'typescript',
        isDirty: true
      }
    ],
    activeWorktreeId: 'folder:first',
    // Upstream watches inactive Workspaces only while they are among the recently visited.
    lastVisitedAtByWorktreeId: { [getWorktreeVisitKey('folder:second')]: 1 },
    settings: null,
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    gitStatusHugeByWorktree: {},
    sshConnectionStates: new Map()
  }
}

function watchedPaths(state: EditorExternalWatchTargetState): string[][] {
  return selectEditorExternalWatchTargets(state)
    .targets.map(({ worktreeId, worktreePath }) => [worktreeId, worktreePath])
    .sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
}

describe('local Project editor watches', () => {
  it('watches every root in active and recently visited contexts with open files', () => {
    expect(watchedPaths(fixture())).toEqual([
      ['folder:first', '/app_a'],
      ['folder:first', '/app_b'],
      ['folder:second', '/app_a'],
      ['folder:second', '/app_b']
    ])
  })

  it('uses each workspace existing-checkout binding rather than its default-root projection', () => {
    const state = fixture()
    selectEditorExternalWatchTargets(state)
    state.localProjects = {
      ...state.localProjects,
      workspaces: state.localProjects.workspaces.map((workspace) =>
        workspace.id === 'second'
          ? { ...workspace, checkoutOverridesByRootId: { b: '/alternate_b' } }
          : workspace
      )
    }
    expect(watchedPaths(state)).toEqual([
      ['folder:first', '/app_a'],
      ['folder:first', '/app_b'],
      ['folder:second', '/alternate_b'],
      ['folder:second', '/app_a']
    ])
  })
})
