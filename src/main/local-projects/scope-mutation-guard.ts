import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import { hasPersistedStructuredAgentSessionStore } from '../runtime/structured-agent-session-runtime'
import { observeStructuredWorker } from '../runtime/structured-worker-authority'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import type { LocalWorkspaceScopeMutationGuard } from './scope-persistence'

type ScopeMutationRuntime = Pick<
  OrcaRuntimeService,
  'acquireWorktreeTerminalMutation' | 'listTerminals'
>

function assertStructuredSessionsExited(worktreeIds: readonly string[]): void {
  const host = getStructuredAgentSessionHost()
  if (!host) {
    if (hasPersistedStructuredAgentSessionStore(getProfileUserDataPath())) {
      throw new Error(
        'Agent session state is not ready. Wait for session restoration before changing roots.'
      )
    }
    return
  }
  if (host.deps.store.readOnly || host.deps.store.hasUnreadableRecords) {
    throw new Error('Agent session state is unverifiable; Workspace roots have not changed.')
  }
  for (const record of host.deps.store.listConversations()) {
    if (
      record.location.executionHostId !== LOCAL_EXECUTION_HOST_ID ||
      !worktreeIds.includes(record.location.workspaceId)
    ) {
      continue
    }
    if (
      record.ownerObservation.handoffStage !== null ||
      record.ownerObservation.unreconciled ||
      observeStructuredWorker({ sessionId: record.sessionId }).status !== 'exited'
    ) {
      throw new Error(
        'Stop the Workspace agents before changing its roots. A live or unverifiable session still owns this context.'
      )
    }
  }
}

export function localWorkspaceScopeMutationGuard(
  runtime: ScopeMutationRuntime
): LocalWorkspaceScopeMutationGuard {
  return async (workspaceIds, operation) => {
    const ids = [...new Set(workspaceIds.map(folderWorkspaceKey))].sort()
    const releases: (() => void)[] = []
    try {
      for (const id of ids) {
        releases.push(
          await runtime.acquireWorktreeTerminalMutation(id, 'exclusive', Date.now() + 10_000)
        )
      }
      const assertIdle = async () => {
        for (const id of ids) {
          const inventory = await runtime.listTerminals(`id:${id}`, 10_000, {
            requireFreshPtyLiveness: true,
            includeVisualLayouts: false
          })
          if (
            inventory.truncated ||
            !inventory.hostScope?.hostIds.includes(LOCAL_EXECUTION_HOST_ID) ||
            inventory.hostScope.omittedHostIds.includes(LOCAL_EXECUTION_HOST_ID)
          ) {
            throw new Error('Terminal state is unverifiable; Workspace roots have not changed.')
          }
          if (inventory.terminals.length > 0) {
            throw new Error('Close the Workspace terminals before changing its roots.')
          }
        }
        assertStructuredSessionsExited(ids)
      }
      await assertIdle()
      return await operation(assertIdle)
    } finally {
      for (const release of releases.toReversed()) {
        release()
      }
    }
  }
}
