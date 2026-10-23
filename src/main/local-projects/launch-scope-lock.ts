import type { SleepingAgentLaunchConfig } from '../../shared/agent-session-resume'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import type { ResolvedLocalWorkspace } from '../../shared/local-projects/types'
import { localProjectRootScopeChangesExecution } from '../../shared/local-projects/scope-update'
import type { AgentSessionAttachParams } from '../native-chat/agent-session-wire/structured-agent-session-attach'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { RuntimeStore } from '../runtime/runtime-store-contract'

type Store = Pick<RuntimeStore, 'resolveLocalWorkspace'>
type Runtime = Pick<OrcaRuntimeService, 'acquireWorktreeTerminalMutation'>
type PtyLaunch = {
  worktreeId?: string
  connectionId?: string | null
  cwd?: string
  sessionId?: string
  resumeProviderSession?: unknown
  launchConfig?: SleepingAgentLaunchConfig
}

function resolveWorkspace(
  store: Store | undefined,
  worktreeId: string | undefined
): ResolvedLocalWorkspace | null {
  const key = worktreeId ? parseWorkspaceKey(worktreeId) : null
  return key?.type === 'folder'
    ? (store?.resolveLocalWorkspace?.(key.folderWorkspaceId) ?? null)
    : null
}

function assertFreshScope(
  current: ResolvedLocalWorkspace | null,
  captured: ResolvedLocalWorkspace | undefined
): void {
  if (
    !current ||
    !captured ||
    current.workspaceId !== captured.workspaceId ||
    current.projectId !== captured.projectId ||
    localProjectRootScopeChangesExecution(current, captured)
  ) {
    throw new Error(
      'Workspace roots changed before launch. Start a new session using the current roots.'
    )
  }
}

/**
 * Runs under upstream's worktree spawn lock, which the caller already holds (`release`): the launch
 * must still match its Workspace's current roots. Releases the lock before refusing.
 */
export function assertLocalWorkspacePtyLaunchUnderLock(
  store: Store | undefined,
  args: PtyLaunch,
  release: (() => void) | undefined
): void {
  if (!resolveWorkspace(store, args.worktreeId)) {
    return
  }
  try {
    if (!release || !args.worktreeId || args.connectionId) {
      throw new Error('Local Workspace execution owner is unavailable.')
    }
    const current = resolveWorkspace(store, args.worktreeId)
    if (!current) {
      throw new Error('Local Workspace no longer exists.')
    }
    if (!args.sessionId && !args.resumeProviderSession) {
      if (args.launchConfig?.localWorkspaceScope) {
        assertFreshScope(current, args.launchConfig.localWorkspaceScope)
      } else if (
        args.cwd &&
        !current.roots.some((root) => isPathInsideOrEqual(root.path, args.cwd!))
      ) {
        throw new Error('The requested terminal directory is no longer inside this Workspace.')
      }
    }
  } catch (error) {
    release?.()
    throw error
  }
}

export async function acquireLocalWorkspaceStructuredLaunch(
  store: Store,
  runtime: Runtime,
  params: AgentSessionAttachParams
): Promise<() => void> {
  const workspaceId = params.location.workspaceId
  if (!resolveWorkspace(store, workspaceId)) {
    return () => {}
  }
  if (params.location.executionHostId !== 'local' || params.location.wslDistro !== null) {
    throw new Error('Local Workspace agents require the native local execution owner.')
  }
  const release = await runtime.acquireWorktreeTerminalMutation(workspaceId, 'shared')
  try {
    const existing = getStructuredAgentSessionHost()?.deps.store.getRecord(
      params.envelope.sessionId
    )
    if (!existing) {
      assertFreshScope(resolveWorkspace(store, workspaceId), params.localWorkspaceScope)
    }
    return release
  } catch (error) {
    release()
    throw error
  }
}
