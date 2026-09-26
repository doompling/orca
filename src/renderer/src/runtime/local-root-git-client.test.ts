import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeGitStatus } from './runtime-git-status-client'
import { getRuntimeGitDiff } from './runtime-git-diff-client'
import { stageRuntimeGitPath, unstageRuntimeGitPath } from './runtime-git-working-tree-client'
import { commitRuntimeGit } from './runtime-git-sync-client'
import type { RuntimeGitContext } from './runtime-git-client-context'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: rpc,
  getActiveRuntimeTarget: (
    settings: { activeRuntimeEnvironmentId?: string | null } | null | undefined
  ) =>
    settings?.activeRuntimeEnvironmentId
      ? { kind: 'environment', environmentId: settings.activeRuntimeEnvironmentId }
      : { kind: 'local' }
}))
const git = { status: vi.fn(), diff: vi.fn(), stage: vi.fn(), unstage: vi.fn(), commit: vi.fn() }
const context: RuntimeGitContext = {
  settings: { activeRuntimeEnvironmentId: null },
  worktreeId: 'folder:workspace',
  worktreePath: '/second',
  localRoot: { workspaceId: 'workspace', rootId: 'second' }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: { git } })
})
afterEach(() => vi.unstubAllGlobals())

describe('explicit local root Git client route', () => {
  it('carries the same selected root and physical path through all five operations', async () => {
    await getRuntimeGitStatus(context)
    await getRuntimeGitDiff(context, { filePath: 'same.txt', staged: false })
    await stageRuntimeGitPath(context, 'same.txt')
    await unstageRuntimeGitPath(context, 'same.txt')
    await commitRuntimeGit(context, 'Commit B')
    for (const call of Object.values(git)) {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ localRoot: context.localRoot, worktreePath: '/second' })
      )
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    { connectionId: 'ssh-host' },
    { settings: { activeRuntimeEnvironmentId: 'remote' } },
    { worktreeId: 'folder:other' }
  ])('refuses a substituted owner before desktop or remote dispatch: %j', async (changes) => {
    const target = { ...context, ...changes }
    await expect(getRuntimeGitStatus(target)).rejects.toThrow('original local Workspace owner')
    await expect(
      getRuntimeGitDiff(target, { filePath: 'same.txt', staged: true })
    ).rejects.toThrow()
    await expect(stageRuntimeGitPath(target, 'same.txt')).rejects.toThrow()
    await expect(unstageRuntimeGitPath(target, 'same.txt')).rejects.toThrow()
    await expect(commitRuntimeGit(target, 'No')).rejects.toThrow()
    Object.values(git).forEach((call) => expect(call).not.toHaveBeenCalled())
    expect(rpc).not.toHaveBeenCalled()
  })
})
