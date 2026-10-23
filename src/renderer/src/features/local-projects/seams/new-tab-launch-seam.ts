import type { LocalWorkspaceLaunchScope } from '../../../../../shared/local-projects/agent-launch-scope'
import { resolveTuiAgentLaunchArgs } from '../../../../../shared/tui-agent-launch-defaults'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import type { AgentStartupShell } from '../../../../../shared/tui-agent-startup-shell'
import type { LocalProjectsState } from '../../../../../shared/local-projects/types'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import {
  allowLocalWorkspaceAgentRoute,
  prepareLocalWorkspaceAgentLaunch
} from '@/lib/local-workspace-agent-launch'
import { planLaunchAgentStartupPrompt } from '@/lib/launch-agent-startup-prompt-plan'

type NewTabArgs = {
  agent: TuiAgent
  worktreeId: string
  prompt?: string
  agentArgs?: string | null
  initialCwd?: string | null
}
type LaunchStore = { localProjects?: LocalProjectsState; settings?: GlobalSettings | null }
type ExecutionContext = {
  resolvedLaunchPlatform: NodeJS.Platform
  isRemote: boolean
  queuedShell?: AgentStartupShell
}
type Prepared = ReturnType<typeof prepareLocalWorkspaceAgentLaunch>

// Why per args object: one launch call reads its prepared scope at several points.
const preparedByArgs = new WeakMap<NewTabArgs, Prepared>()

/**
 * Prepares a new-tab agent launch into a local multi-root Workspace (all roots as `--add-dir`, the
 * Workspace context ahead of the prompt) and refuses providers or hosts that cannot carry them.
 * True for every other workspace.
 */
function admitLocalWorkspaceNewTab(
  store: LaunchStore,
  args: NewTabArgs,
  context: ExecutionContext
): boolean {
  const prepared = prepareLocalWorkspaceAgentLaunch({
    localProjects: store.localProjects,
    worktreeId: args.worktreeId,
    agent: args.agent,
    agentArgs:
      args.agentArgs !== undefined
        ? args.agentArgs
        : resolveTuiAgentLaunchArgs(args.agent, store.settings?.agentDefaultArgs),
    commandOverride: store.settings?.agentCmdOverrides?.[args.agent],
    initialCwd: args.initialCwd,
    prompt: args.prompt?.trim() ?? '',
    platform: context.resolvedLaunchPlatform,
    shell: context.queuedShell,
    isRemote: context.isRemote
  })
  preparedByArgs.set(args, prepared)
  return allowLocalWorkspaceAgentRoute(prepared, 'terminal-tui')
}

function localLaunch(args: NewTabArgs) {
  const prepared = preparedByArgs.get(args)
  return prepared?.kind === 'local' ? prepared : null
}

/** Startup-plan fields for the launch: the rooted arguments and frozen scope when local. */
function localWorkspaceStartupArgs<T>(
  args: NewTabArgs,
  agentArgs: T
): { agentArgs: T | string; localWorkspaceScope?: LocalWorkspaceLaunchScope } {
  const local = localLaunch(args)
  return local ? { agentArgs: local.agentArgs, localWorkspaceScope: local.scope } : { agentArgs }
}

/** The terminal startup prompt: the Workspace context comes first when local. */
function localWorkspaceStartupPrompt(args: NewTabArgs, prompt: string): string {
  return localLaunch(args)?.prompt ?? prompt
}

/** A local Workspace launch never takes the host-built prompt route: main would drop its roots. */
function localWorkspaceHostRoute<T extends object>(
  args: NewTabArgs,
  input: T
): T & { pastesPrompt: boolean } {
  return { ...input, pastesPrompt: localLaunch(args) === null }
}

/** Upstream's startup-prompt plan with the rooted arguments, frozen scope and Workspace context
 *  applied when the launch is local; unchanged otherwise. */
function planLocalWorkspaceStartupPrompt(
  args: NewTabArgs,
  input: Parameters<typeof planLaunchAgentStartupPrompt>[0]
): ReturnType<typeof planLaunchAgentStartupPrompt> {
  return planLaunchAgentStartupPrompt({
    ...input,
    base: { ...input.base, ...localWorkspaceStartupArgs(args, input.base.agentArgs) },
    prompt: localWorkspaceStartupPrompt(args, input.prompt)
  })
}

/** One import for the new-tab launch file, which sits at its line cap. */
export const localNewTab = {
  admit: admitLocalWorkspaceNewTab,
  plan: planLocalWorkspaceStartupPrompt,
  hostRoute: localWorkspaceHostRoute
}
