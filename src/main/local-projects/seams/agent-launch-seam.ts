import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import {
  localWorkspaceContextDescription,
  type LocalWorkspaceLaunchScope
} from '../../../shared/local-projects/agent-launch-scope'
import { readStructuredLocalWorkspaceScope } from '../structured-agent-scope'

type ScopedRecord = Pick<AgentSessionRecord, 'sessionId' | 'location'>

/** The cwd a local Workspace chat launches in; undefined for any other session. */
export async function localWorkspaceLaunchDirectory(
  record: ScopedRecord
): Promise<string | undefined> {
  return (await readStructuredLocalWorkspaceScope(record))?.cwd
}

/**
 * Claude options that give a local Workspace chat every root: the roots join the directories
 * upstream already grants, and the Workspace context is appended to the preset system prompt.
 */
export async function localWorkspaceClaudeOptions(
  record: ScopedRecord,
  additionalDirectories: readonly string[]
): Promise<
  | {
      additionalDirectories: string[]
      systemPrompt: { type: 'preset'; preset: 'claude_code'; append: string }
    }
  | Record<string, never>
> {
  const scope = await readStructuredLocalWorkspaceScope(record)
  if (!scope) {
    return {}
  }
  return {
    additionalDirectories: [
      ...new Set([...additionalDirectories, ...scope.roots.map((root) => root.path)])
    ],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: localWorkspaceContextDescription(scope)
    }
  }
}

/** The frozen roots a Codex local Workspace thread opens with; empty for any other session. */
export async function localWorkspaceCodexLaunch(
  record: ScopedRecord
): Promise<{ localWorkspaceScope: LocalWorkspaceLaunchScope } | Record<string, never>> {
  const scope = await readStructuredLocalWorkspaceScope(record)
  return scope ? { localWorkspaceScope: scope } : {}
}
