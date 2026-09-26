import { describe, expect, it } from 'vitest'
import { projectLocalFolderWorkspaces } from './folder-projection'
import { LocalProjectsStateSchema, readLocalProjectsState } from './schema'
import type { LocalProjectsState } from './types'
import { resolveLocalWorkspace, resolveLocalWorkspaceKey } from './workspace-resolution'

function state(): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [
          { id: 'a', label: 'App A', path: '/app-a' },
          { id: 'b', label: 'App B', path: '/app-b' }
        ],
        defaultRootId: 'b',
        lastWorkspaceId: 'main',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: [
      {
        id: 'main',
        projectId: 'project',
        name: 'Main',
        checkoutOverridesByRootId: {},
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'task',
        projectId: 'project',
        name: 'Task',
        checkoutOverridesByRootId: { a: '/alternate-a' },
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 2,
        updatedAt: 2
      }
    ]
  }
}

describe('local Workspace resolution and folder projection', () => {
  it('keeps every ordered root and applies only the Workspace checkout override', () => {
    const input = state()
    expect(resolveLocalWorkspace(input, 'task')).toEqual({
      workspaceId: 'task',
      projectId: 'project',
      defaultRootId: 'a',
      roots: [
        { id: 'a', label: 'App A', path: '/alternate-a' },
        { id: 'b', label: 'App B', path: '/app-b' }
      ]
    })
    expect(resolveLocalWorkspace(input, 'main')?.roots[0].path).toBe('/app-a')
    expect(input.projects[0].roots[0].path).toBe('/app-a')
  })

  it('projects explicit defaults into existing folder session identity without path deduplication', () => {
    const input = state()
    input.workspaces[1].checkoutOverridesByRootId = {}
    const rows = projectLocalFolderWorkspaces(input)
    expect(rows.map((row) => [row.id, row.folderPath, row.executionHostId])).toEqual([
      ['main', '/app-b', 'local'],
      ['task', '/app-a', 'local']
    ])
    expect(resolveLocalWorkspaceKey(input, 'folder:main')?.workspaceId).toBe('main')
    expect(resolveLocalWorkspaceKey(input, 'worktree:main')).toBeNull()
    expect(resolveLocalWorkspaceKey(input, 'folder:missing')).toBeNull()
  })

  it('does not treat inherited object properties as root overrides', () => {
    const input = state()
    input.projects[0].roots[0].id = 'constructor'
    expect(resolveLocalWorkspace(input, 'main')?.roots[0].path).toBe('/app-a')
  })

  it('projects optional presentation metadata without changing another Workspace', () => {
    const input = state()
    Object.assign(input.workspaces[0], { isUnread: true, isPinned: true, lastActivityAt: 42 })
    const rows = projectLocalFolderWorkspaces(readLocalProjectsState(input))
    expect(rows[0]).toMatchObject({ isUnread: true, isPinned: true, lastActivityAt: 42 })
    expect(rows[1]).toMatchObject({ isUnread: false, isPinned: false, lastActivityAt: 0 })
    expect(input.workspaces[1]).not.toHaveProperty('lastActivityAt')
  })

  it('retains archived contexts while marking their folder projection archived', () => {
    const input = state()
    input.projects[0].isArchived = true
    expect(resolveLocalWorkspace(input, 'main')).not.toBeNull()
    expect(projectLocalFolderWorkspaces(input).every((row) => row.isArchived)).toBe(true)
  })

  it.each(['default', 'override', 'owner', 'last-workspace', 'duplicate-root'])(
    'rejects an invalid %s reference',
    (kind) => {
      const input = state()
      if (kind === 'default') {
        input.projects[0].defaultRootId = 'missing'
      } else if (kind === 'override') {
        input.workspaces[0].checkoutOverridesByRootId = { missing: '/elsewhere' }
      } else if (kind === 'owner') {
        input.workspaces[0].projectId = 'missing'
      } else if (kind === 'last-workspace') {
        input.projects[0].lastWorkspaceId = 'missing'
      } else {
        input.projects[0].roots[1].id = 'a'
      }
      expect(LocalProjectsStateSchema.safeParse(input).success).toBe(false)
    }
  )

  it('starts absent data empty but refuses unsupported data without rewriting it', () => {
    expect(readLocalProjectsState(undefined)).toEqual({ version: 1, projects: [], workspaces: [] })
    const unsupported = { ...state(), version: 2 }
    expect(() => readLocalProjectsState(unsupported)).toThrow('has not been changed')
    expect(unsupported.version).toBe(2)
  })
})
