import { ipcMain } from 'electron'
import { commitChanges } from '../../git/status'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
// Ether seam: git
import { resolveLocalRootGitTarget, type LocalRootGitArgs } from '../../local-projects/git-target'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'

export function registerFilesystemGitCommitHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:commit',
    async (
      _event,
      args: LocalRootGitArgs & { message: string }
    ): Promise<{ success: boolean; error?: string }> => {
      // Why: validate at the IPC boundary so the renderer gets a clear error instead of an opaque execFile failure.
      if (typeof args.message !== 'string' || args.message.trim().length === 0) {
        throw new Error('Commit message is required')
      }
      // Ether seam: git
      const localRoot = await resolveLocalRootGitTarget(store, args)
      if (!localRoot) {
        requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      }
      const worktreePath =
        localRoot?.worktreePath ?? (await resolveRegisteredWorktreePath(args.worktreePath, store))
      const gitOptions =
        localRoot?.gitOptions ??
        getLocalGitOptionsForRegisteredWorktree(store, args.worktreePath, worktreePath)
      return commitChanges(worktreePath, args.message, {
        ...gitOptions,
        admissionTier: 'interactive'
      })
    }
  )
}
