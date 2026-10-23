// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusResult } from '../../../../shared/git-status-types'
import { useLocalRootGit } from './use-local-root-git'

const { read, stage, unstage, commit } = vi.hoisted(() => ({
  read: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn()
}))
vi.mock('@/runtime/runtime-git-status-client', () => ({ getRuntimeGitStatus: read }))
vi.mock('@/runtime/runtime-git-working-tree-client', () => ({
  stageRuntimeGitPath: stage,
  unstageRuntimeGitPath: unstage
}))
vi.mock('@/runtime/runtime-git-sync-client', () => ({ commitRuntimeGit: commit }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const a = { id: 'a', label: 'A', path: '/a' }
const b = { id: 'b', label: 'B', path: '/b' }
const status: GitStatusResult = {
  branch: 'refs/heads/main',
  entries: [],
  conflictOperation: 'unknown'
}

describe('per-root Source Control state', () => {
  it('pins each mutation to the rendered root, including after another root is mounted', async () => {
    read.mockResolvedValue(status)
    commit.mockResolvedValue({ success: true })
    const first = renderHook(() => useLocalRootGit('workspace', a))
    const second = renderHook(() => useLocalRootGit('workspace', b))
    await waitFor(() => expect(second.result.current.status).toEqual(status))
    await act(async () => {
      await first.result.current.stage('same.txt')
      await second.result.current.unstage('same.txt')
      await second.result.current.commit('B only')
    })
    expect(stage).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreePath: '/a',
        localRoot: { workspaceId: 'workspace', rootId: 'a' }
      }),
      'same.txt'
    )
    expect(unstage).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/b' }),
      'same.txt'
    )
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: '/b' }), 'B only')
  })

  it('does not publish an old root response into its replacement', async () => {
    let resolveA: ((value: GitStatusResult) => void) | undefined
    read
      .mockImplementationOnce(
        () =>
          new Promise<GitStatusResult>((resolve) => {
            resolveA = resolve
          })
      )
      .mockResolvedValue(status)
    const first = renderHook(() => useLocalRootGit('workspace', a))
    first.unmount()
    const second = renderHook(() => useLocalRootGit('workspace', b))
    await waitFor(() => expect(second.result.current.status).toEqual(status))
    await act(async () => resolveA?.({ ...status, branch: 'old-A' }))
    expect(second.result.current.status?.branch).toBe('refs/heads/main')
  })

  it('keeps unavailable roots unavailable and reports failed commits without claiming success', async () => {
    read.mockRejectedValue(new Error('This root is not a Git checkout'))
    const view = renderHook(() => useLocalRootGit('workspace', b))
    await waitFor(() => expect(view.result.current.error).toContain('not a Git checkout'))
    expect(view.result.current.status).toBeNull()
    commit.mockResolvedValue({ success: false, error: 'hook refused' })
    await act(async () => expect(view.result.current.commit('No')).resolves.toBe(false))
    expect(view.result.current.error).toBe('hook refused')
  })
})
