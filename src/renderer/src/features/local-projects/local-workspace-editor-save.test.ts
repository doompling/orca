import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import { projectLocalFolderWorkspaces } from '../../../../shared/local-projects/folder-projection'
import type { OpenFile } from '@/store/slices/editor'
import { createEditorSaveQueue } from '@/components/editor/editor-save-queue'
import { getDiskBaselineSignature } from '@/components/editor/diff-content-signature'
import { __clearSelfWriteRegistryForTests } from '@/components/editor/editor-self-write-registry'
import {
  createEditorStore,
  stubEditorWindow
} from '@/components/editor/editor-autosave-controller-test-fixture'
import {
  LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE,
  verifyLocalWorkspaceEditorSave
} from './local-workspace-editor-save'

const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('@/runtime/runtime-file-client', () => ({
  readRuntimeFileContent: io.read,
  writeRuntimeFile: io.write
}))

const localProjects: LocalProjectsState = {
  version: 1,
  projects: [
    {
      id: 'project',
      name: 'Application',
      roots: [{ id: 'a', label: 'App A', path: '/app_a' }],
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

function editorFile(id: string, worktreeId: string): OpenFile {
  return {
    id,
    worktreeId,
    filePath: '/app_a/shared.ts',
    relativePath: 'shared.ts',
    mode: 'edit',
    language: 'typescript',
    isDirty: true,
    lastKnownDiskSignature: getDiskBaselineSignature('original')
  }
}

describe('local Workspace save conflict contract', () => {
  const queues: ReturnType<typeof createEditorSaveQueue>[] = []
  let disk = 'original'
  beforeEach(() => {
    vi.clearAllMocks()
    stubEditorWindow()
    disk = 'original'
    io.read.mockImplementation(async () => ({ content: disk, isBinary: false }))
    io.write.mockImplementation(async (_context: unknown, _path: string, content: string) => {
      disk = content
    })
  })
  afterEach(() => {
    for (const queue of queues.splice(0)) {
      queue.dispose()
    }
    vi.unstubAllGlobals()
    __clearSelfWriteRegistryForTests()
  })

  function fixture() {
    const store = createEditorStore()
    const first = editorFile('first-file', 'folder:first')
    const second = editorFile('second-file', 'folder:second')
    store.setState({
      localProjects,
      folderWorkspaces: projectLocalFolderWorkspaces(localProjects),
      projectGroups: [],
      worktreesByRepo: {},
      openFiles: [first, second],
      editorDrafts: { [first.id]: 'first draft', [second.id]: 'second draft' }
    })
    const queue = createEditorSaveQueue(store)
    queues.push(queue)
    return { store, first, second, queue }
  }

  it('saves to the exact target when the draft still matches its disk baseline', async () => {
    const { store, first, queue } = fixture()
    await queue.queueSave(first, 'fallback')
    expect(disk).toBe('first draft')
    expect(io.write).toHaveBeenCalledWith(expect.anything(), '/app_a/shared.ts', 'first draft')
    expect(store.getState().editorDrafts[first.id]).toBeUndefined()
    expect(store.getState().editorDrafts['second-file']).toBe('second draft')
  })

  it('detects a conflicting save even before a filesystem watcher event arrives', async () => {
    const { store, first, second, queue } = fixture()
    await queue.queueSave(first, 'fallback')
    await expect(queue.queueSave(second, 'fallback')).rejects.toThrow(
      LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE
    )
    expect(disk).toBe('first draft')
    expect(io.write).toHaveBeenCalledTimes(1)
    expect(store.getState().openFiles.find((file) => file.id === second.id)?.externalMutation).toBe(
      'changed'
    )
    expect(store.getState().editorDrafts[second.id]).toBe('second draft')
  })

  it('serializes concurrent workspace saves against one physical disk target', async () => {
    const { first, second, queue } = fixture()
    const results = await Promise.allSettled([
      queue.queueSave(first, 'fallback'),
      queue.queueSave(second, 'fallback')
    ])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(io.write).toHaveBeenCalledTimes(1)
    expect(disk).toBe('first draft')
  })

  it('allows saving after explicit conflict resolution advances the baseline', async () => {
    const { store, first, second, queue } = fixture()
    await queue.queueSave(first, 'fallback')
    await expect(queue.queueSave(second, 'fallback')).rejects.toThrow(
      LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE
    )
    store.getState().setLastKnownDiskSignature(second.id, getDiskBaselineSignature(disk))
    store.getState().setExternalMutation(second.id, null)
    await queue.queueSave(second, 'fallback')
    expect(disk).toBe('second draft')
  })

  it('keeps unreadable disk state and missing baselines from silently overwriting a file', async () => {
    const { store, first, queue } = fixture()
    io.read.mockRejectedValueOnce(new Error('File not found'))
    await expect(queue.queueSave(first, 'fallback')).rejects.toThrow('File not found')
    expect(io.write).not.toHaveBeenCalled()
    expect(store.getState().editorDrafts[first.id]).toBe('first draft')

    await expect(
      verifyLocalWorkspaceEditorSave(store.getState(), {
        ...first,
        lastKnownDiskSignature: undefined
      })
    ).rejects.toThrow(LOCAL_WORKSPACE_SAVE_CONFLICT_MESSAGE)
  })

  it('does not alter legacy, SSH, or runtime save behavior', async () => {
    const { store, first } = fixture()
    for (const file of [
      { ...first, worktreeId: 'legacy-worktree' },
      { ...first, runtimeEnvironmentId: 'remote' },
      { ...first, externalSshTargetId: 'ssh-host' }
    ]) {
      await verifyLocalWorkspaceEditorSave(store.getState(), file)
    }
    expect(io.read).not.toHaveBeenCalled()
  })
})
