import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { assertLegacyAgentEntrypointSupportsWorkspace } from '../../shared/local-projects/agent-entrypoint'
import type { RuntimeStore } from '../runtime/runtime-store-contract'

export function assertRuntimeAgentEntrypointSupportsWorkspace(
  store: Pick<RuntimeStore, 'resolveLocalWorkspace'> | undefined,
  worktreeId: string
): void {
  const key = parseWorkspaceKey(worktreeId)
  if (key?.type === 'folder') {
    assertLegacyAgentEntrypointSupportsWorkspace(
      store?.resolveLocalWorkspace?.(key.folderWorkspaceId)
    )
  }
}
