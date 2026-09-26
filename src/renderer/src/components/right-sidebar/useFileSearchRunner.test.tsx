// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../../shared/code-search-types'
import { useFileSearchRunner } from './useFileSearchRunner'

const mocks = vi.hoisted(() => ({
  getConnectionId: vi.fn(),
  getState: vi.fn(),
  searchRuntimeFiles: vi.fn(),
  statRuntimePath: vi.fn()
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: mocks.getConnectionId
}))

vi.mock('@/runtime/runtime-file-client', () => ({
  searchRuntimeFiles: mocks.searchRuntimeFiles,
  statRuntimePath: mocks.statRuntimePath
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(vi.fn(), { getState: mocks.getState })
}))

const RESULTS: SearchResult = {
  files: [],
  totalMatches: 0,
  truncated: false
}

function renderSearchRunner(state: Record<string, unknown>, worktreeId: string) {
  const updates: Record<string, unknown>[] = []
  mocks.getState.mockImplementation(() => state)
  mocks.searchRuntimeFiles.mockResolvedValue(RESULTS)

  const hook = renderHook(() =>
    useFileSearchRunner({
      activeWorktreeId: worktreeId,
      worktreePath: '/repo',
      updateActiveSearchState: (update) => updates.push(update)
    })
  )

  return { hook, updates }
}

async function finishSearch(executeSearch: (query: string) => void): Promise<void> {
  await act(async () => {
    executeSearch('owner')
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('useFileSearchRunner result ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getConnectionId.mockReturnValue(null)
    mocks.statRuntimePath.mockResolvedValue({ size: 0, isDirectory: true, mtime: 1 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('commits the explicit remote owner used for the search, not the ambient runtime', async () => {
    const worktreeId = 'repo-a::/repo'
    const state = {
      settings: { activeRuntimeEnvironmentId: 'ambient-runtime-b' },
      repos: [{ id: 'repo-a', executionHostId: 'runtime:repo-runtime' }],
      worktreesByRepo: {
        'repo-a': [{ id: worktreeId, repoId: 'repo-a', hostId: 'runtime:search-runtime-a' }]
      },
      fileSearchStateByWorktree: { [worktreeId]: {} }
    }
    const { hook, updates } = renderSearchRunner(state, worktreeId)

    await finishSearch(hook.result.current.executeSearch)

    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { activeRuntimeEnvironmentId: 'search-runtime-a' },
        worktreeId
      }),
      expect.any(Object)
    )
    expect(updates).toContainEqual({
      results: RESULTS,
      resultOwner: {
        worktreeId,
        runtimeEnvironmentId: 'search-runtime-a'
      }
    })
  })

  it('commits explicit local ownership without inheriting an ambient runtime', async () => {
    const worktreeId = 'repo-a::/repo'
    const state = {
      settings: { activeRuntimeEnvironmentId: 'ambient-runtime-b' },
      repos: [{ id: 'repo-a', executionHostId: 'runtime:repo-runtime' }],
      worktreesByRepo: {
        'repo-a': [{ id: worktreeId, repoId: 'repo-a', hostId: 'local' }]
      },
      fileSearchStateByWorktree: { [worktreeId]: {} }
    }
    const { hook, updates } = renderSearchRunner(state, worktreeId)

    await finishSearch(hook.result.current.executeSearch)

    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({ settings: { activeRuntimeEnvironmentId: null }, worktreeId }),
      expect.any(Object)
    )
    expect(updates).toContainEqual({
      results: RESULTS,
      resultOwner: { worktreeId, runtimeEnvironmentId: null }
    })
  })

  it('preserves SSH routing through the worktree connection without a runtime owner', async () => {
    const worktreeId = 'repo-a::/repo'
    const state = {
      settings: { activeRuntimeEnvironmentId: 'ambient-runtime-b' },
      repos: [{ id: 'repo-a', connectionId: 'ssh-target' }],
      worktreesByRepo: {
        'repo-a': [{ id: worktreeId, repoId: 'repo-a', hostId: 'ssh:ssh-target' }]
      },
      fileSearchStateByWorktree: { [worktreeId]: {} }
    }
    mocks.getConnectionId.mockReturnValue('ssh-target')
    const { hook, updates } = renderSearchRunner(state, worktreeId)

    await finishSearch(hook.result.current.executeSearch)

    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { activeRuntimeEnvironmentId: null },
        worktreeId,
        connectionId: 'ssh-target'
      }),
      expect.any(Object)
    )
    expect(updates).toContainEqual({
      results: RESULTS,
      resultOwner: { worktreeId, runtimeEnvironmentId: null }
    })
  })

  it('keeps an unresolved owner local when no runtime actually handled the search', async () => {
    const worktreeId = 'missing-repo::/repo'
    const state = {
      settings: { activeRuntimeEnvironmentId: null },
      repos: [],
      worktreesByRepo: {},
      fileSearchStateByWorktree: { [worktreeId]: {} }
    }
    const { hook, updates } = renderSearchRunner(state, worktreeId)

    await finishSearch(hook.result.current.executeSearch)

    expect(updates).toContainEqual({
      results: RESULTS,
      resultOwner: { worktreeId, runtimeEnvironmentId: null }
    })
  })

  it('searches all local Workspace roots without inheriting ambient runtime or SSH inference', async () => {
    const worktreeId = 'folder:workspace'
    const state = {
      settings: { activeRuntimeEnvironmentId: 'ambient-remote' },
      fileSearchStateByWorktree: { [worktreeId]: { includePattern: '*.ts' } },
      localProjects: {
        version: 1,
        projects: [
          {
            id: 'project',
            name: 'Project',
            roots: [
              { id: 'a', label: 'A', path: '/a' },
              { id: 'b', label: 'B', path: '/b' }
            ],
            defaultRootId: 'b'
          }
        ],
        workspaces: [
          {
            id: 'workspace',
            projectId: 'project',
            checkoutOverridesByRootId: { a: '/alternate/a' }
          }
        ]
      }
    }
    mocks.getConnectionId.mockReturnValue('inferred-ssh')
    const { hook, updates } = renderSearchRunner(state, worktreeId)
    await finishSearch(hook.result.current.executeSearch)
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledTimes(2)
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      { settings: { activeRuntimeEnvironmentId: null }, worktreeId, worktreePath: '/alternate/a' },
      expect.objectContaining({ rootPath: '/alternate/a', includePattern: '*.ts' })
    )
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      { settings: { activeRuntimeEnvironmentId: null }, worktreeId, worktreePath: '/b' },
      expect.objectContaining({ rootPath: '/b' })
    )
    expect(updates).toContainEqual({
      results: RESULTS,
      resultOwner: { worktreeId, runtimeEnvironmentId: null }
    })
  })
})
