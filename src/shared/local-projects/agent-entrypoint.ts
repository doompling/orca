import type { ResolvedLocalWorkspace } from './types'

export const LOCAL_WORKSPACE_AGENT_ENTRYPOINT_MESSAGE =
  'This launch entry point does not preserve all Workspace roots. Open the Workspace and use New tab → Codex or Claude, or built-in chat. Resume saved Workspace sessions from their existing tabs.'

export function assertLegacyAgentEntrypointSupportsWorkspace(
  workspace: ResolvedLocalWorkspace | null | undefined
): void {
  if (workspace) {
    throw new Error(LOCAL_WORKSPACE_AGENT_ENTRYPOINT_MESSAGE)
  }
}
