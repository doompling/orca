// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffContent } from './editor-panel-content-types'
import { useEditorPanelDiffContentLoader } from './useEditorPanelDiffContentLoader'

const { read, connection, activeSettings } = vi.hoisted(() => ({
  read: vi.fn(),
  connection: vi.fn(() => 'unrelated-ssh-host'),
  activeSettings: { activeRuntimeEnvironmentId: 'unrelated-remote' }
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ settings: activeSettings }) }
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdForFile: connection }))
vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitDiff: read,
  getRuntimeGitBranchDiff: vi.fn(),
  getRuntimeGitCommitDiff: vi.fn(),
  getRuntimeGitScope: vi.fn(() => 'local')
}))

const diff: DiffContent = {
  kind: 'text',
  originalContent: 'before',
  modifiedContent: 'after',
  originalIsBinary: false,
  modifiedIsBinary: false
}
function file(rootId: string): OpenFile {
  return {
    id: `diff:${rootId}`,
    worktreeId: 'folder:workspace',
    localRoot: { workspaceId: 'workspace', rootId },
    filePath: '/checkout/same.txt',
    relativePath: 'same.txt',
    language: 'plaintext',
    mode: 'diff',
    diffSource: 'staged',
    isDirty: false,
    runtimeEnvironmentId: null
  }
}
function useLoader() {
  const [contents, setDiffContents] = useState<Record<string, DiffContent>>({})
  const load = useEditorPanelDiffContentLoader({
    diffReadGenerationCounterRef: useRef(0),
    diffReadGenerationRef: useRef({}),
    outstandingDiffReadsRef: useRef({}),
    setDiffContents
  })
  return { load, contents }
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('local-root diff content routing', () => {
  it('retains the tab root and native host when unrelated remote settings are active', async () => {
    read.mockResolvedValue(diff)
    const { result } = renderHook(useLoader)
    await act(() => result.current.load(file('root-a')))
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        localRoot: { workspaceId: 'workspace', rootId: 'root-a' },
        worktreeId: 'folder:workspace',
        worktreePath: '/checkout',
        connectionId: undefined,
        settings: expect.objectContaining({ activeRuntimeEnvironmentId: null })
      }),
      { filePath: 'same.txt', staged: true, compareAgainstHead: false }
    )
    expect(connection).not.toHaveBeenCalled()
    expect(result.current.contents['diff:root-a']).toEqual(diff)
  })

  it('does not share an in-flight read between distinct root selectors at the same path', async () => {
    read.mockResolvedValue(diff)
    const { result } = renderHook(useLoader)
    await act(async () => {
      await Promise.all([result.current.load(file('root-a')), result.current.load(file('root-b'))])
    })
    expect(read).toHaveBeenCalledTimes(2)
    expect(result.current.contents).toEqual({ 'diff:root-a': diff, 'diff:root-b': diff })
  })
})
