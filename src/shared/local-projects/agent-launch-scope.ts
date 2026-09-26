import { z } from 'zod'
import {
  isPathInsideOrEqual,
  isRuntimePathAbsolute,
  resolveRuntimePath
} from '../cross-platform-path'
import { isWslUncPath } from '../wsl-paths'
import { LocalProjectRootSchema, LocalWorkspaceIdSchema } from './schema'
import type { ResolvedLocalWorkspace } from './types'
import { folderWorkspaceKey } from '../workspace-scope'

const nativePath = z
  .string()
  .min(1)
  .max(32_768)
  .refine(
    (path) => !path.includes('\0') && isRuntimePathAbsolute(path) && !isWslUncPath(path),
    'A native absolute directory is required.'
  )

export const LocalWorkspaceLaunchScopeSchema = z
  .object({
    workspaceId: LocalWorkspaceIdSchema,
    projectId: LocalWorkspaceIdSchema,
    roots: z
      .array(LocalProjectRootSchema.extend({ path: nativePath }))
      .min(1)
      .max(64),
    defaultRootId: LocalWorkspaceIdSchema,
    cwdRootId: LocalWorkspaceIdSchema,
    cwd: nativePath
  })
  .strict()
  .superRefine((scope, context) => {
    const rootIds = new Set(scope.roots.map((root) => root.id))
    const cwdRoot = scope.roots.find((root) => root.id === scope.cwdRootId)
    if (
      rootIds.size !== scope.roots.length ||
      !rootIds.has(scope.defaultRootId) ||
      !cwdRoot ||
      !isPathInsideOrEqual(cwdRoot.path, scope.cwd)
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid frozen Workspace roots or cwd.' })
    }
  })

export type LocalWorkspaceLaunchScope = z.infer<typeof LocalWorkspaceLaunchScopeSchema>

export function captureLocalWorkspaceLaunchScope(
  workspace: ResolvedLocalWorkspace,
  requestedCwd?: string | null
): LocalWorkspaceLaunchScope {
  const defaultRoot = workspace.roots.find((root) => root.id === workspace.defaultRootId)
  if (!defaultRoot) {
    throw new Error('The Workspace default root is unavailable.')
  }
  const cwd = resolveRuntimePath(defaultRoot.path, requestedCwd?.trim() || '.')
  const cwdRoot =
    workspace.roots.find((root) => root.path === cwd) ??
    workspace.roots.find((root) => isPathInsideOrEqual(root.path, cwd))
  if (!cwdRoot) {
    throw new Error('Choose an agent working directory inside a Workspace root.')
  }
  return LocalWorkspaceLaunchScopeSchema.parse({ ...workspace, cwdRootId: cwdRoot.id, cwd })
}

export function copyLocalWorkspaceLaunchScope(
  scope: LocalWorkspaceLaunchScope
): LocalWorkspaceLaunchScope {
  return { ...scope, roots: scope.roots.map((root) => ({ ...root })) }
}

export function localWorkspaceLaunchScopesEqual(
  first: LocalWorkspaceLaunchScope | undefined,
  second: LocalWorkspaceLaunchScope | undefined
): boolean {
  if (!first || !second) {
    return first === second
  }
  return (
    first.workspaceId === second.workspaceId &&
    first.projectId === second.projectId &&
    first.defaultRootId === second.defaultRootId &&
    first.cwdRootId === second.cwdRootId &&
    first.cwd === second.cwd &&
    first.roots.length === second.roots.length &&
    first.roots.every((root, index) => {
      const other = second.roots[index]
      return root.id === other?.id && root.label === other.label && root.path === other.path
    })
  )
}

export function assertLocalWorkspaceLaunchScopeOwner(
  scope: LocalWorkspaceLaunchScope,
  worktreeId: string | undefined,
  connectionId?: string | null
): void {
  LocalWorkspaceLaunchScopeSchema.parse(scope)
  if (folderWorkspaceKey(scope.workspaceId) !== worktreeId || connectionId) {
    throw new Error('The saved agent roots belong to a different Workspace or execution host.')
  }
}

export function localWorkspaceContextDescription(scope: LocalWorkspaceLaunchScope): string {
  const context = JSON.stringify(
    {
      workspaceId: scope.workspaceId,
      roots: scope.roots.map(({ label, path }) => ({ label, path })),
      cwd: scope.cwd
    },
    null,
    2
  )
  return `Workspace context supplied by Orca. All listed directories are roots of this Workspace; use their labels to distinguish matching relative paths. They are existing shared directories, not isolated copies.\n${context}`
}

export function localWorkspaceContextPrompt(
  scope: LocalWorkspaceLaunchScope,
  prompt: string
): string {
  return `${localWorkspaceContextDescription(scope)}\n\n${prompt.trim() || "This message only initializes Workspace context. Wait for the user's task before doing work."}`
}
