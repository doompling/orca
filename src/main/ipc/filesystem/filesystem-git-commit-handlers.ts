import { ipcMain } from 'electron'
import { commitChanges } from '../../git/status'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../../providers/ssh-git-dispatch'
import { resolveDesktopGitTarget, type LocalRootGitArgs } from '../../local-projects/git-target'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

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
      if (args.connectionId && !args.localRoot) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.commit(args.worktreePath, args.message)
      }
      const { worktreePath, gitOptions } = await resolveDesktopGitTarget(store, args)
      return commitChanges(worktreePath, args.message, {
        ...gitOptions,
        admissionTier: 'interactive'
      })
    }
  )
}
