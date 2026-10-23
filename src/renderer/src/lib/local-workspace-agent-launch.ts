import { toast } from 'sonner'
import type { LocalProjectsState } from '../../../shared/local-projects/types'
import { resolveLocalWorkspaceKey } from '../../../shared/local-projects/workspace-resolution'
import {
  captureLocalWorkspaceLaunchScope,
  localWorkspaceContextPrompt,
  type LocalWorkspaceLaunchScope
} from '../../../shared/local-projects/agent-launch-scope'
import {
  localWorkspaceAgentArguments,
  supportsLocalWorkspaceAgent
} from '../../../shared/local-projects/agent-root-arguments'
import {
  resolveStartupShell,
  type AgentStartupShell
} from '../../../shared/tui-agent-startup-shell'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { AgentLaunchRoute } from './agent-launch-routing'

type LocalWorkspaceAgentLaunch =
  | { kind: 'legacy' }
  | { kind: 'refused'; message: string }
  | { kind: 'local'; scope: LocalWorkspaceLaunchScope; agentArgs: string; prompt: string }

export function prepareLocalWorkspaceAgentLaunch(args: {
  localProjects: LocalProjectsState | undefined
  worktreeId: string
  agent: TuiAgent
  agentArgs?: string | null
  commandOverride?: string
  initialCwd?: string | null
  prompt: string
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  isRemote: boolean
}): LocalWorkspaceAgentLaunch {
  const workspace =
    args.localProjects && resolveLocalWorkspaceKey(args.localProjects, args.worktreeId)
  if (!workspace) {
    return { kind: 'legacy' }
  }
  if (args.isRemote || !supportsLocalWorkspaceAgent(args.agent)) {
    return {
      kind: 'refused',
      message:
        'This Workspace supports local Codex and Claude sessions. Other providers do not yet receive all roots.'
    }
  }
  try {
    const scope = captureLocalWorkspaceLaunchScope(workspace, args.initialCwd)
    return {
      kind: 'local',
      scope,
      agentArgs: localWorkspaceAgentArguments({
        scope,
        agent: args.agent,
        agentArgs: args.agentArgs,
        commandOverride: args.commandOverride,
        shell: resolveStartupShell(args.platform, args.shell)
      }),
      prompt: localWorkspaceContextPrompt(scope, args.prompt)
    }
  } catch (error) {
    return {
      kind: 'refused',
      message: error instanceof Error ? error.message : 'The Workspace roots are unavailable.'
    }
  }
}

export function allowLocalWorkspaceAgentRoute(
  launch: LocalWorkspaceAgentLaunch,
  route: AgentLaunchRoute | 'host-published'
): boolean {
  if (launch.kind === 'refused') {
    toast.error(launch.message)
    return false
  }
  if (launch.kind === 'local' && route !== 'terminal-tui' && route !== 'structured-native-chat') {
    toast.error(
      'This agent mode does not receive all Workspace roots. Use a local Codex or Claude terminal or built-in chat.'
    )
    return false
  }
  return true
}
