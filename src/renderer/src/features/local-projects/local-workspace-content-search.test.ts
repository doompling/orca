import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../../shared/code-search-types'
import type { ResolvedLocalWorkspace } from '../../../../shared/local-projects/types'
import { searchRuntimeFiles } from '@/runtime/runtime-file-search-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { searchLocalWorkspaceContents } from './local-workspace-content-search'

vi.mock('@/runtime/runtime-file-search-client', () => ({ searchRuntimeFiles: vi.fn() }))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({ statRuntimePath: vi.fn() }))
const search = vi.mocked(searchRuntimeFiles)
const workspace: ResolvedLocalWorkspace = {
  workspaceId: 'workspace',
  projectId: 'project',
  defaultRootId: 'b',
  roots: [
    { id: 'a', label: 'App A', path: '/code/a' },
    { id: 'b', label: 'App B', path: '/checkout/b' }
  ]
}
function result(root: string, count = 1): SearchResult {
  return {
    files: [
      {
        filePath: `${root}/src/index.ts`,
        relativePath: 'src/index.ts',
        matches: Array.from({ length: count }, (_, index) => ({
          line: index + 1,
          column: 1,
          matchLength: 6,
          lineContent: 'needle'
        }))
      }
    ],
    totalMatches: count,
    truncated: false
  }
}

describe('Local Workspace contents search', () => {
  beforeEach(() => {
    search.mockReset()
    vi.mocked(statRuntimePath)
      .mockReset()
      .mockResolvedValue({ size: 0, isDirectory: true, mtime: 1 })
  })

  it('searches every resolved root with local ownership and unchanged options and paths', async () => {
    search.mockImplementation(async (_context, options) => result(options.rootPath))
    const results = await searchLocalWorkspaceContents(
      workspace,
      {
        query: 'needle',
        wholeWord: true,
        includePattern: '*.ts',
        excludePattern: 'dist',
        maxResults: 2000
      },
      () => true
    )
    expect(search).toHaveBeenNthCalledWith(
      1,
      {
        target: { kind: 'local' },
        worktreeId: 'folder:workspace',
        worktreePath: '/code/a'
      },
      {
        query: 'needle',
        wholeWord: true,
        includePattern: '*.ts',
        excludePattern: 'dist',
        maxResults: 1000,
        rootPath: '/code/a'
      },
      undefined
    )
    expect(results.files).toEqual([
      expect.objectContaining({
        filePath: '/code/a/src/index.ts',
        relativePath: 'src/index.ts',
        workspaceRootLabel: 'App A'
      }),
      expect.objectContaining({
        filePath: '/checkout/b/src/index.ts',
        relativePath: 'src/index.ts',
        workspaceRootLabel: 'App B'
      })
    ])
    expect(results.totalMatches).toBe(2)
    expect(results.truncated).toBe(false)
  })

  it('retains successful results and reports the exact failed root', async () => {
    search
      .mockResolvedValueOnce(result('/code/a'))
      .mockRejectedValueOnce(new Error('Directory missing'))
    const results = await searchLocalWorkspaceContents(workspace, { query: 'needle' }, () => true)
    expect(results.files).toHaveLength(1)
    expect(results.workspaceSearchErrors).toEqual(['App B: Directory missing'])
    expect(results.truncated).toBe(true)
  })

  it('caps combined results and propagates root truncation', async () => {
    search.mockResolvedValue({ ...result('/code/a', 10), truncated: true })
    const results = await searchLocalWorkspaceContents(
      workspace,
      { query: 'needle', maxResults: 3 },
      () => true
    )
    expect(results.files.flatMap((file) => file.matches)).toHaveLength(3)
    expect(results.totalMatches).toBe(3)
    expect(results.truncated).toBe(true)
  })

  it('deduplicates one physical file found through overlapping roots without relabelling its path', async () => {
    search.mockResolvedValue(result('/code/a'))
    const results = await searchLocalWorkspaceContents(workspace, { query: 'needle' }, () => true)
    expect(results.files).toHaveLength(1)
    expect(results.files[0]).toMatchObject({
      relativePath: 'src/index.ts',
      workspaceRootLabel: 'App A'
    })
    expect(results.totalMatches).toBe(1)
  })

  it('limits concurrent root calls and does not start queued roots after cancellation', async () => {
    const releases: (() => void)[] = []
    let current = true
    search.mockImplementation(
      (_context, options) =>
        new Promise((resolve) => releases.push(() => resolve(result(options.rootPath))))
    )
    const pending = searchLocalWorkspaceContents(
      { ...workspace, roots: [...workspace.roots, { id: 'c', label: 'C', path: '/c' }] },
      { query: 'needle' },
      () => current
    )
    await Promise.resolve()
    expect(search).toHaveBeenCalledTimes(2)
    current = false
    releases.forEach((release) => release())
    await pending
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('reports a missing or non-directory root instead of presenting a successful empty scan', async () => {
    vi.mocked(statRuntimePath)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce({ size: 1, isDirectory: false, mtime: 1 })
    const results = await searchLocalWorkspaceContents(workspace, { query: 'needle' }, () => true)
    expect(search).not.toHaveBeenCalled()
    expect(results.workspaceSearchErrors).toEqual([
      'App A: ENOENT',
      'App B: Workspace root is not a directory.'
    ])
    expect(results.truncated).toBe(true)
  })
})
