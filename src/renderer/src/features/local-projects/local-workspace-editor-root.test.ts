import { describe, expect, it } from 'vitest'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { getLocalWorkspaceEditorRoot } from './local-workspace-editor-root'

function catalog(): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'full',
        name: 'Full application',
        roots: [
          { id: 'a', label: 'App A', path: '/app_a' },
          { id: 'b', label: 'App B', path: '/app_b' }
        ],
        defaultRootId: 'a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'focused',
        name: 'Only A',
        roots: [{ id: 'focused-a', label: 'Focused A', path: '/app_a' }],
        defaultRootId: 'focused-a',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: [
      {
        id: 'first',
        projectId: 'full',
        name: 'First',
        checkoutOverridesByRootId: { b: '/alternate_b' },
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'second',
        projectId: 'focused',
        name: 'Second',
        checkoutOverridesByRootId: {},
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ]
  }
}

describe('local Workspace editor root labels', () => {
  it('labels a shared path using its saved Workspace owner, not another Project', () => {
    const state = catalog()
    const file = { worktreeId: 'folder:first', filePath: '/app_a/src/index.ts' }
    expect(getLocalWorkspaceEditorRoot(state, file)?.label).toBe('App A')
    expect(
      getLocalWorkspaceEditorRoot(state, { ...file, worktreeId: 'folder:second' })?.label
    ).toBe('Focused A')
  })

  it('resolves alternate checkout bindings without using the default directory', () => {
    const state = catalog()
    const file = { worktreeId: 'folder:first', filePath: '/alternate_b/README.md' }
    expect(getLocalWorkspaceEditorRoot(state, file)?.label).toBe('App B')
    state.workspaces[0].defaultRootId = 'b'
    expect(getLocalWorkspaceEditorRoot(state, file)?.label).toBe('App B')
    expect(
      getLocalWorkspaceEditorRoot(state, { ...file, filePath: '/app_a/README.md' })?.label
    ).toBe('App A')
    expect(getLocalWorkspaceEditorRoot(state, { ...file, filePath: '/app_b/README.md' })).toBeNull()
  })

  it('chooses the containing root and does not match a sibling with a common prefix', () => {
    const state = catalog()
    state.projects[0].roots.push({ id: 'nested', label: 'Library', path: '/app_a/library' })
    expect(
      getLocalWorkspaceEditorRoot(state, {
        worktreeId: 'folder:first',
        filePath: '/app_a/library/index.ts'
      })?.label
    ).toBe('Library')
    expect(
      getLocalWorkspaceEditorRoot(state, {
        worktreeId: 'folder:first',
        filePath: '/app_another/index.ts'
      })
    ).toBeNull()
  })

  it('supports Windows paths without changing the stored file path', () => {
    const state = catalog()
    state.projects[0].roots[0].path = 'C:\\work\\app_a'
    const file = { worktreeId: 'folder:first', filePath: 'C:\\work\\app_a\\README.md' }
    expect(getLocalWorkspaceEditorRoot(state, file)?.label).toBe('App A')
    expect(file.filePath).toBe('C:\\work\\app_a\\README.md')
  })

  it('leaves legacy, remote, virtual, and outside-root files alone', () => {
    const state = catalog()
    const file = { worktreeId: 'folder:first', filePath: '/app_a/README.md' }
    for (const candidate of [
      { ...file, worktreeId: 'legacy-worktree' },
      { ...file, runtimeEnvironmentId: 'runtime' },
      { ...file, externalSshTargetId: 'ssh-host' },
      { ...file, filePath: '/app_a' },
      { ...file, filePath: '/outside/README.md' }
    ]) {
      expect(getLocalWorkspaceEditorRoot(state, candidate)).toBeNull()
    }
    expect(getLocalWorkspaceEditorRoot(undefined, file)).toBeNull()
  })
})
