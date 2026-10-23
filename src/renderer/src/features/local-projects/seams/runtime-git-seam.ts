import type { LocalWorkspaceGitRoot } from '../../../../../shared/local-projects/git-root'
import { folderWorkspaceKey } from '../../../../../shared/workspace-scope'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'

/** The `localRoot` a local Workspace Git call carries; refused outside its local owner. */
export function localRootGitArgs(context: RuntimeGitContext): {
  localRoot?: LocalWorkspaceGitRoot
} {
  if (!context.localRoot) {
    return {}
  }
  if (
    context.connectionId ||
    context.target.kind !== 'local' ||
    context.worktreeId !== folderWorkspaceKey(context.localRoot.workspaceId)
  ) {
    throw new Error('Local Workspace Git requires its original local Workspace owner.')
  }
  return { localRoot: context.localRoot }
}
