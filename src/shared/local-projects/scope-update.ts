import { z } from 'zod'
import { LocalProjectRootSchema, LocalWorkspaceIdSchema } from './schema'
import type { LocalProject, LocalWorkspace } from './types'

export const LocalProjectRootScopeSchema = z
  .object({
    roots: z.array(LocalProjectRootSchema).min(1).max(64),
    defaultRootId: LocalWorkspaceIdSchema
  })
  .strict()

const checkoutOverrides = z.record(
  LocalWorkspaceIdSchema,
  z
    .string()
    .min(1)
    .max(32_768)
    .refine((path) => !path.includes('\0'))
)
export const LocalWorkspaceCheckoutScopeSchema = z
  .object({
    projectRoots: z.array(LocalProjectRootSchema).min(1).max(64),
    projectDefaultRootId: LocalWorkspaceIdSchema,
    checkoutOverridesByRootId: checkoutOverrides,
    defaultRootId: LocalWorkspaceIdSchema.nullable()
  })
  .strict()

export const UpdateLocalProjectRootsSchema = LocalProjectRootScopeSchema.extend({
  projectId: LocalWorkspaceIdSchema,
  expected: LocalProjectRootScopeSchema
}).strict()

export const UpdateLocalWorkspaceCheckoutsSchema = z
  .object({
    workspaceId: LocalWorkspaceIdSchema,
    expected: LocalWorkspaceCheckoutScopeSchema,
    checkoutOverridesByRootId: checkoutOverrides,
    defaultRootId: LocalWorkspaceIdSchema.nullable()
  })
  .strict()

export type LocalProjectRootScope = z.infer<typeof LocalProjectRootScopeSchema>
export type LocalWorkspaceCheckoutScope = z.infer<typeof LocalWorkspaceCheckoutScopeSchema>
export type UpdateLocalProjectRootsArgs = z.infer<typeof UpdateLocalProjectRootsSchema>
export type UpdateLocalWorkspaceCheckoutsArgs = z.infer<typeof UpdateLocalWorkspaceCheckoutsSchema>

export function localProjectRootScope(project: LocalProject): LocalProjectRootScope {
  return { roots: project.roots.map((root) => ({ ...root })), defaultRootId: project.defaultRootId }
}

export function localWorkspaceCheckoutScope(
  project: LocalProject,
  workspace: LocalWorkspace
): LocalWorkspaceCheckoutScope {
  return {
    projectRoots: project.roots.map((root) => ({ ...root })),
    projectDefaultRootId: project.defaultRootId,
    checkoutOverridesByRootId: { ...workspace.checkoutOverridesByRootId },
    defaultRootId: workspace.defaultRootId ?? null
  }
}

export function sameLocalProjectRootScope(
  first: LocalProjectRootScope,
  second: LocalProjectRootScope
): boolean {
  return (
    first.defaultRootId === second.defaultRootId &&
    first.roots.length === second.roots.length &&
    first.roots.every((root, index) => {
      const other = second.roots[index]
      return root.id === other?.id && root.path === other.path && root.label === other.label
    })
  )
}

export function sameLocalCheckoutOverrides(
  first: Record<string, string>,
  second: Record<string, string>
): boolean {
  return (
    Object.keys(first).length === Object.keys(second).length &&
    Object.entries(first).every(([id, path]) => Object.hasOwn(second, id) && second[id] === path)
  )
}

export function sameLocalWorkspaceCheckoutScope(
  first: LocalWorkspaceCheckoutScope,
  second: LocalWorkspaceCheckoutScope
): boolean {
  return (
    sameLocalProjectRootScope(
      { roots: first.projectRoots, defaultRootId: first.projectDefaultRootId },
      { roots: second.projectRoots, defaultRootId: second.projectDefaultRootId }
    ) &&
    first.defaultRootId === second.defaultRootId &&
    sameLocalCheckoutOverrides(first.checkoutOverridesByRootId, second.checkoutOverridesByRootId)
  )
}

export function localProjectRootScopeChangesExecution(
  first: LocalProjectRootScope,
  second: LocalProjectRootScope
): boolean {
  return (
    first.defaultRootId !== second.defaultRootId ||
    first.roots.length !== second.roots.length ||
    first.roots.some(
      (root) => !second.roots.some((other) => other.id === root.id && other.path === root.path)
    )
  )
}
