import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import type { LocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { resolveCliCommand, withCliRuntimeOnPath } from '../../shared/node-cli-command-resolution'
import { readStructuredLocalWorkspaceScope } from '../local-projects/structured-agent-scope'
import type { AgentSessionRecordStore } from '../runtime/agent-session-record-store'
import { supportsNativeStructuredLocation } from '../native-chat/structured-agent-session-location-support'
import {
  pinnedOpenCodeEnvironment,
  type OpenCodeAccountHome
} from './opencode-structured-account-home'

export type OpenCodePermissionRule = {
  permission: string
  pattern: string
  action: 'allow' | 'ask' | 'deny'
}

export type OpenCodeStructuredLaunch = {
  command: string
  cwd: string
  env: Record<string, string>
  envToDelete: string[]
  accountHome: OpenCodeAccountHome
  localWorkspaceScope?: LocalWorkspaceLaunchScope
  resumeSessionId: string | null
  permissionRules: OpenCodePermissionRule[]
}

export { supportsNativeStructuredLocation as supportsOpenCodeStructuredLocation }

export function openCodeWorkspacePermissionRules(
  roots: readonly string[]
): OpenCodePermissionRule[] {
  const rules: OpenCodePermissionRule[] = [
    { permission: '*', pattern: '*', action: 'ask' },
    ...['read', 'glob', 'grep', 'list', 'todowrite', 'todoread'].map((permission) => ({
      permission,
      pattern: '*',
      action: 'allow' as const
    })),
    { permission: 'external_directory', pattern: '*', action: 'ask' }
  ]
  for (const root of new Set(roots)) {
    if (/[?*]/.test(root)) {
      throw new Error('OpenCode cannot safely grant a Workspace directory containing * or ?.')
    }
    const pattern = root.replaceAll('\\', '/').replace(/\/$/, '')
    rules.push(
      { permission: 'external_directory', pattern, action: 'allow' },
      { permission: 'external_directory', pattern: `${pattern}/*`, action: 'allow' }
    )
  }
  return rules
}

export function createOpenCodeStructuredLaunchResolver(deps: {
  store: Pick<AgentSessionRecordStore, 'getRecord'>
  resolveWorkspacePath: (workspaceId: string) => Promise<string>
  resolveEnvironment: () => Promise<NodeJS.ProcessEnv>
  resolveCommand?: (environment: NodeJS.ProcessEnv) => string
}): (input: { identity: AgentSessionJournalIdentity }) => Promise<OpenCodeStructuredLaunch> {
  return async ({ identity }) => {
    const record = deps.store.getRecord(identity.sessionId)
    if (
      !record ||
      record.provider !== 'opencode' ||
      record.accountHome.variable !== 'XDG_DATA_HOME'
    ) {
      throw new Error('OpenCode requires its own saved session and account directories.')
    }
    if (!supportsNativeStructuredLocation(record.location)) {
      throw new Error('OpenCode chat is available only in native local Workspaces.')
    }
    const localWorkspaceScope = await readStructuredLocalWorkspaceScope(record)
    const cwd =
      localWorkspaceScope?.cwd ?? (await deps.resolveWorkspacePath(record.location.workspaceId))
    const environment = await deps.resolveEnvironment()
    const command =
      deps.resolveCommand?.(environment) ??
      resolveCliCommand('opencode', {
        pathEnv: environment.PATH ?? environment.Path,
        homePath: environment.HOME ?? environment.USERPROFILE
      })
    const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
    if (head && head.handle.provider !== 'opencode') {
      throw new Error('The saved conversation belongs to another provider.')
    }
    return {
      command,
      cwd,
      ...pinnedOpenCodeEnvironment(record.accountHome, withCliRuntimeOnPath(command, environment)),
      accountHome: record.accountHome,
      ...(localWorkspaceScope ? { localWorkspaceScope } : {}),
      resumeSessionId: head?.handle.provider === 'opencode' ? head.handle.sessionId : null,
      permissionRules: openCodeWorkspacePermissionRules(
        localWorkspaceScope?.roots.map((root) => root.path) ?? [cwd]
      )
    }
  }
}
