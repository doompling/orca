import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../../../shared/code-search-types'
import { localWorkspaceFileSearch } from './file-search-seam'

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { state, searchRuntimeFiles: vi.fn(), statRuntimePath: vi.fn() }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/runtime/runtime-file-search-client', () => ({
  searchRuntimeFiles: mocks.searchRuntimeFiles
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  statRuntimePath: mocks.statRuntimePath
}))

const EMPTY: SearchResult = { files: [], totalMatches: 0, truncated: false }
const worktreeId = 'folder:workspace'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchRuntimeFiles.mockResolvedValue(EMPTY)
  mocks.statRuntimePath.mockResolvedValue({ size: 0, isDirectory: true, mtime: 1 })
  mocks.state = {
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
          defaultRootId: 'b',
          isArchived: false,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      workspaces: [
        {
          id: 'workspace',
          projectId: 'project',
          name: 'Main',
          checkoutOverridesByRootId: { a: '/alternate/a' },
          isArchived: false,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    }
  }
})

describe('local Workspace file search seam', () => {
  it('leaves every other workspace to the runtime search', () => {
    expect(localWorkspaceFileSearch('repo::/code', () => true)).toBeNull()
  })

  it('searches all roots on this host, ignoring the runtime context it is handed', async () => {
    const search = localWorkspaceFileSearch(worktreeId, () => true)
    await search?.(
      {
        target: { kind: 'environment', environmentId: 'ambient-remote' },
        worktreeId,
        worktreePath: '/b',
        connectionId: 'inferred-ssh'
      },
      { query: 'needle', rootPath: '/b', includePattern: '*.ts' }
    )
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledTimes(2)
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      { target: { kind: 'local' }, worktreeId, worktreePath: '/alternate/a' },
      expect.objectContaining({ rootPath: '/alternate/a', includePattern: '*.ts' }),
      undefined
    )
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledWith(
      { target: { kind: 'local' }, worktreeId, worktreePath: '/b' },
      expect.objectContaining({ rootPath: '/b' }),
      undefined
    )
  })
})
