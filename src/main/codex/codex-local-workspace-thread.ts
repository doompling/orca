import { z } from 'zod'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison
} from '../../shared/cross-platform-path'
import {
  localWorkspaceContextDescription,
  type LocalWorkspaceLaunchScope
} from '../../shared/local-projects/agent-launch-scope'
import type { CodexAppServerConnection } from './codex-app-server-connection'
import type { CodexStructuredPermissionPolicy } from './codex-structured-permission-policy'

const configReply = z.object({
  config: z.object({
    developer_instructions: z.string().nullish(),
    sandbox_workspace_write: z.object({ writable_roots: z.array(z.string()).optional() }).nullish()
  })
})

export async function localWorkspaceCodexThreadOverrides(
  connection: Pick<CodexAppServerConnection, 'request'>,
  scope: LocalWorkspaceLaunchScope | undefined,
  timeoutMs: number | undefined
): Promise<Record<string, unknown>> {
  if (!scope) {
    return {}
  }
  const reply = configReply.safeParse(
    await connection.request('config/read', { includeLayers: false, cwd: scope.cwd }, { timeoutMs })
  )
  if (!reply.success) {
    throw new Error('Codex could not report its configuration for this multi-root Workspace.')
  }
  const config = reply.data.config
  return {
    config: {
      'sandbox_workspace_write.writable_roots': [
        ...new Set([
          ...(config.sandbox_workspace_write?.writable_roots ?? []),
          ...scope.roots.map((root) => root.path)
        ])
      ]
    },
    developerInstructions: [config.developer_instructions, localWorkspaceContextDescription(scope)]
      .filter(Boolean)
      .join('\n\n')
  }
}

const openedScope = z.object({
  cwd: z.string(),
  sandbox: z.object({ type: z.string(), writableRoots: z.array(z.string()).optional() })
})

export function assertCodexLocalWorkspaceThreadScope(
  opened: unknown,
  scope: LocalWorkspaceLaunchScope | undefined,
  policy: CodexStructuredPermissionPolicy | undefined
): void {
  if (!scope) {
    return
  }
  const reply = openedScope.safeParse(opened)
  if (
    !reply.success ||
    normalizeRuntimePathForComparison(reply.data.cwd) !==
      normalizeRuntimePathForComparison(scope.cwd)
  ) {
    throw new Error('Codex did not confirm the saved Workspace working directory.')
  }
  if (policy?.sandbox === 'danger-full-access' && reply.data.sandbox.type === 'dangerFullAccess') {
    return
  }
  if (
    reply.data.sandbox.type !== 'workspaceWrite' ||
    !scope.roots.every((root) =>
      reply.data.sandbox.writableRoots?.some((path) => isPathInsideOrEqual(path, root.path))
    )
  ) {
    throw new Error('Codex did not grant access to every Workspace directory; no task was started.')
  }
}
