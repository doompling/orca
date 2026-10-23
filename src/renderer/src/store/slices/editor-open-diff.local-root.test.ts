import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from './editor-slice-test-harness'

vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('createEditorSlice openDiff for local Workspace roots', () => {
  it('keeps identical relative paths in distinct local roots separate without changing the folder session', () => {
    const store = createEditorStore()
    const openRootDiff = (rootId: string): void =>
      store
        .getState()
        .openDiff('folder:workspace', `/${rootId}/same.txt`, 'same.txt', 'plaintext', false, {
          preview: false,
          runtimeEnvironmentId: null,
          localRoot: { workspaceId: 'workspace', rootId }
        })
    openRootDiff('a')
    openRootDiff('b')
    const files = store.getState().openFiles
    expect(new Set(files.map((file) => file.id)).size).toBe(2)
    expect(files.map((file) => file.localRoot?.rootId)).toEqual(['a', 'b'])
    expect(files.every((file) => file.worktreeId === 'folder:workspace')).toBe(true)
    openRootDiff('a')
    expect(store.getState().openFiles).toHaveLength(2)
    expect(store.getState().openFiles[0].diffContentReloadNonce).toBe(1)
  })
})
