import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type * as Autosave from '@/components/editor/editor-autosave'
import { notifyEditorExternalFileChange } from '@/components/editor/editor-autosave'
import {
  __clearSelfWriteRegistryForTests,
  recordSelfWrite
} from '@/components/editor/editor-self-write-registry'
import { buildEditorExternalWatchEventHandler } from './editor-external-watch-event-reconciliation'
import { findEditorWatchOwners } from './editor-external-watch-ownership'
import type { EditorExternalWatchTarget } from './editor-external-watch-targets'

const getState = vi.hoisted(() => vi.fn())
vi.mock('@/store', () => ({ useAppStore: { getState } }))
vi.mock('@/components/editor/editor-autosave', async (importOriginal) => ({
  ...(await importOriginal<typeof Autosave>()),
  notifyEditorExternalFileChange: vi.fn()
}))

function target(worktreeId: string, worktreePath = '/repo'): EditorExternalWatchTarget {
  return { worktreeId, worktreePath, connectionId: undefined, runtimeEnvironmentId: null }
}

function file(id: string, worktreeId: string, isDirty = false, root = '/repo'): OpenFile {
  return {
    id,
    filePath: `${root}/same.ts`,
    relativePath: 'same.ts',
    worktreeId,
    mode: 'edit',
    language: 'typescript',
    isDirty
  }
}

describe('shared directory editor watches', () => {
  const setExternalMutation = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    __clearSelfWriteRegistryForTests()
  })

  it('fans a physical event out to every local workspace, not another runtime or SSH host', () => {
    const first = target('folder:first')
    const second = target('folder:second')
    expect(
      findEditorWatchOwners(
        [
          first,
          second,
          { ...target('ssh'), connectionId: 'remote' },
          { ...target('runtime'), runtimeEnvironmentId: 'remote-env' }
        ],
        '/repo',
        null
      )
    ).toEqual([first, second])
  })

  it('refreshes both clean workspace views of the same physical file', () => {
    const targets = [target('folder:first'), target('folder:second')]
    getState.mockReturnValue({
      openFiles: [file('first', 'folder:first'), file('second', 'folder:second')],
      setExternalMutation
    })
    const handler = buildEditorExternalWatchEventHandler(() => targets)
    handler.handleFsChanged({
      worktreePath: '/repo',
      events: [{ kind: 'update', absolutePath: '/repo/same.ts' }]
    })
    vi.advanceTimersByTime(100)
    expect(
      vi.mocked(notifyEditorExternalFileChange).mock.calls.map(([event]) => event.worktreeId)
    ).toEqual(['folder:first', 'folder:second'])
    handler.dispose()
  })

  it('marks a neighboring dirty workspace even during the saving workspace echo window', () => {
    getState.mockReturnValue({
      openFiles: [file('second', 'folder:second', true)],
      setExternalMutation
    })
    recordSelfWrite('/repo/same.ts', 'saved elsewhere', null, undefined, 'folder:first')
    const handler = buildEditorExternalWatchEventHandler(() => [target('folder:second')])
    handler.handleFsChanged({
      worktreePath: '/repo',
      events: [{ kind: 'update', absolutePath: '/repo/same.ts' }]
    })
    expect(setExternalMutation).toHaveBeenCalledWith('second', 'changed')
    expect(notifyEditorExternalFileChange).not.toHaveBeenCalled()
    handler.dispose()
  })

  it('does not collapse same-named files from two roots into one debounced refresh', () => {
    const targets = [target('folder:first', '/app_a'), target('folder:first', '/app_b')]
    getState.mockReturnValue({
      openFiles: [
        file('a', 'folder:first', false, '/app_a'),
        file('b', 'folder:first', false, '/app_b')
      ],
      setExternalMutation
    })
    const handler = buildEditorExternalWatchEventHandler((path, runtime) =>
      findEditorWatchOwners(targets, path, runtime)
    )
    for (const root of ['/app_a', '/app_b']) {
      handler.handleFsChanged({
        worktreePath: root,
        events: [{ kind: 'update', absolutePath: `${root}/same.ts` }]
      })
    }
    vi.advanceTimersByTime(100)
    expect(
      vi.mocked(notifyEditorExternalFileChange).mock.calls.map(([event]) => event.worktreePath)
    ).toEqual(['/app_a', '/app_b'])
    handler.dispose()
  })
})
