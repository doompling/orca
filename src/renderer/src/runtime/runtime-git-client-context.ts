import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '../../../shared/commit-message-agent-spec'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '../../../shared/commit-message-host-key'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { HostedReviewProvider } from '../../../shared/hosted-review'
import type { ResolvedSourceControlAiGenerationParams } from '../../../shared/source-control-ai'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { getActiveRuntimeTarget } from './runtime-rpc-client'
import type { LocalWorkspaceGitRoot } from '../../../shared/local-projects/git-root'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

export type RuntimeGenerateCommitMessageResult =
  | { success: true; message: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type RuntimeGeneratePullRequestFieldsResult =
  | {
      success: true
      fields: { base: string; title: string; body: string; draft: boolean }
      agentLabel?: string
      branchChangedByPreparation?: boolean
    }
  | { success: false; error: string; canceled?: boolean; branchChangedByPreparation?: boolean }

export type RuntimePullRequestGenerationInput = {
  base: string
  title: string
  body: string
  draft: boolean
  provider?: HostedReviewProvider
  useTemplate?: boolean
}

export type RuntimeGitSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> &
  Partial<
    Pick<
      GlobalSettings,
      'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'defaultTuiAgent'
    >
  >

export type RuntimeDiscoverCommitMessageModelsResult =
  | {
      success: true
      capability: CommitMessageAgentCapability
      models: CommitMessageModelCapability[]
      defaultModelId: string
      /** Missing only when an older remote runtime produced the response. */
      catalogOrigin?: 'probe' | 'spec'
    }
  | { success: false; error: string }

export type RuntimeGitContext = {
  localRoot?: LocalWorkspaceGitRoot
  settings: RuntimeGitSettings | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string
  connectionId?: string
}

export type RuntimeGenerateCommitMessageOverrides = {
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
  sourceControlAi?: GlobalSettings['sourceControlAi']
  agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
}

export type RuntimeGeneratePullRequestFieldsOverrides = RuntimeGenerateCommitMessageOverrides

export function resolveLocalWorktreePath(context: RuntimeGitContext): string {
  if (context.localRoot) {
    return context.worktreePath
  }
  return context.worktreeId
    ? (splitWorktreeIdForFilesystem(context.worktreeId)?.worktreePath ?? context.worktreePath)
    : context.worktreePath
}

export function localRootGitArgs(context: RuntimeGitContext): {
  localRoot?: LocalWorkspaceGitRoot
} {
  if (!context.localRoot) {
    return {}
  }
  if (
    context.connectionId ||
    getActiveRuntimeTarget(context.settings).kind !== 'local' ||
    context.worktreeId !== folderWorkspaceKey(context.localRoot.workspaceId)
  ) {
    throw new Error('Local Workspace Git requires its original local Workspace owner.')
  }
  return { localRoot: context.localRoot }
}

export function getRuntimeGitScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId: string | null | undefined
): string | null | undefined {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? `runtime:${target.environmentId}` : connectionId
}

export function getRuntimeCommitMessageSettings(
  settings: RuntimeGitSettings | null | undefined,
  connectionId?: string
): Partial<
  Pick<
    GlobalSettings,
    'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'defaultTuiAgent'
  >
> & {
  commitMessageDiscoveryHostKey?: string
} {
  if (!settings) {
    return {}
  }
  const scope = getRuntimeGitScope(settings, connectionId)
  return {
    ...(settings.commitMessageAi !== undefined
      ? { commitMessageAi: settings.commitMessageAi }
      : {}),
    ...(settings.sourceControlAi !== undefined
      ? { sourceControlAi: settings.sourceControlAi }
      : {}),
    ...(settings.agentCmdOverrides !== undefined
      ? { agentCmdOverrides: settings.agentCmdOverrides }
      : {}),
    ...(settings.defaultTuiAgent !== undefined
      ? { defaultTuiAgent: settings.defaultTuiAgent }
      : {}),
    commitMessageDiscoveryHostKey: getCommitMessageModelDiscoveryHostKeyForScope(scope)
  }
}
