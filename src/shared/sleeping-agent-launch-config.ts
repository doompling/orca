import type { SleepingAgentLaunchConfig } from './agent-session-resume'
import {
  copyLocalWorkspaceLaunchScope,
  type LocalWorkspaceLaunchScope
} from './local-projects/agent-launch-scope'

export function buildSleepingAgentLaunchConfig(args: {
  agentCommand?: string | null
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  ompResumeFilePath?: string | null
  localWorkspaceScope?: LocalWorkspaceLaunchScope
}): SleepingAgentLaunchConfig {
  return {
    ...(args.agentCommand?.trim() ? { agentCommand: args.agentCommand } : {}),
    agentArgs: args.agentArgs ?? '',
    // Why: startup env may include prompt transport or pane identity values;
    // durable resume state is limited to Orca-managed agent inputs.
    agentEnv: args.agentEnv ? { ...args.agentEnv } : {},
    // Ether seam: agent-launch
    ...(args.localWorkspaceScope
      ? { localWorkspaceScope: copyLocalWorkspaceLaunchScope(args.localWorkspaceScope) }
      : {}),
    ...(args.ompResumeFilePath?.trim() ? { ompResumeFilePath: args.ompResumeFilePath.trim() } : {})
  }
}
