import {
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../tui-agent-startup-shell'
import type { TuiAgent } from '../tui-agent'
import type { LocalWorkspaceLaunchScope } from './agent-launch-scope'

export function supportsLocalWorkspaceAgent(agent: TuiAgent): agent is 'claude' | 'codex' {
  return agent === 'claude' || agent === 'codex'
}

export function localWorkspaceAgentArguments(args: {
  scope: LocalWorkspaceLaunchScope
  agent: 'claude' | 'codex'
  agentArgs?: string | null
  commandOverride?: string
  shell: AgentStartupShell
}): string {
  const tokens = tokenizeStartupCommand(args.agentArgs?.trim() || '', args.shell)
  const override = args.commandOverride?.trim()
    ? tokenizeStartupCommand(args.commandOverride.trim(), args.shell)
    : null
  if (!tokens.ok || (override && !override.ok)) {
    throw new Error('The agent command or arguments could not be parsed.')
  }
  const commandTokens = override?.ok ? override.tokens : []
  const executable = commandTokens[0]?.replace(/^.*[\\/]/, '').replace(/\.(?:exe|cmd)$/i, '')
  if (executable && executable !== args.agent) {
    throw new Error('Multi-root Workspaces require the standard Codex or Claude terminal command.')
  }
  const conflicting =
    args.agent === 'codex'
      ? ['--', '--cd', '-C', '--worktree', '--remote', 'resume', 'fork']
      : [
          '--',
          '--worktree',
          '-w',
          '--resume',
          '-r',
          '--continue',
          '-c',
          '--fork-session',
          '--teleport',
          '--session-id'
        ]
  if (
    [...tokens.tokens, ...commandTokens.slice(1)].some((token) =>
      conflicting.some(
        (flag) =>
          token === flag ||
          token.startsWith(`${flag}=`) ||
          (flag.length === 2 && flag !== '--' && token.startsWith(flag))
      )
    )
  ) {
    throw new Error(
      'Remove agent arguments that change the Workspace directory or resume another session.'
    )
  }
  const rootArgs = [...new Set(args.scope.roots.map((root) => root.path))].flatMap((path) => [
    '--add-dir',
    path
  ])
  if (args.agent === 'codex') {
    rootArgs.push('--cd', args.scope.cwd)
  }
  return [...tokens.tokens, ...rootArgs]
    .map((token) => quoteStartupArg(token, args.shell))
    .join(' ')
}
