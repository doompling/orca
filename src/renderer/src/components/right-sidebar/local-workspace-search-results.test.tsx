// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileResultRow } from './SearchResultItems'
import { SearchResultsPane } from './SearchResultsPane'
import { openMatchResult } from './search-match-open'

describe('Local Workspace search presentation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('labels a same-named file by root without changing the relative path', () => {
    render(
      <FileResultRow
        collapsed={false}
        onToggleCollapse={() => {}}
        fileResult={{
          filePath: '/a/src/index.ts',
          relativePath: 'src/index.ts',
          workspaceRootLabel: 'App A',
          matches: []
        }}
      />
    )
    expect(screen.getByText('App A · src')).toBeTruthy()
    expect(screen.getByText('index.ts')).toBeTruthy()
  })

  it('keeps root failures visible even when no root produced matches', () => {
    render(
      <SearchResultsPane
        results={{
          files: [],
          totalMatches: 0,
          truncated: true,
          workspaceSearchErrors: ['App B: Directory missing']
        }}
        hasCommittedResults
        query="needle"
        loading={false}
        rows={[]}
        scrollRef={createRef()}
        onToggleCollapsedFile={() => {}}
        onMatchClick={() => {}}
      />
    )
    expect(screen.getByRole('status').textContent).toContain('Search incomplete')
    expect(screen.getByRole('status').textContent).toContain('App B: Directory missing')
  })

  it('opens a labelled result using its captured Workspace and original physical paths', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    const openFile = vi.fn()
    openMatchResult({
      resultOwner: { worktreeId: 'folder:workspace-a', runtimeEnvironmentId: null },
      fileResult: { filePath: '/b/src/index.ts', relativePath: 'src/index.ts', matches: [] },
      match: { line: 2, column: 1, matchLength: 6, lineContent: 'needle' },
      openFile,
      setPendingEditorReveal: vi.fn(),
      revealRafRef: createRef(),
      revealInnerRafRef: createRef()
    })
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'folder:workspace-a',
        filePath: '/b/src/index.ts',
        relativePath: 'src/index.ts',
        runtimeEnvironmentId: null
      }),
      { suppressActiveRuntimeFallback: true }
    )
  })
})
