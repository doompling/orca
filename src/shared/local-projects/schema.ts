import { z } from 'zod'
import type { LocalProjectsState } from './types'
import { emptyLocalProjectsState } from './workspace-resolution'
import {
  LocalWorkspaceLinearIssuesSchema,
  LocalWorkspaceLinearIssueSelectionSchema
} from './linear-issues'

const id = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !value.includes('\0'))
const name = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => !value.includes('\0'))
const path = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => !value.includes('\0'))
const timestamp = z.number().finite().nonnegative()
const markSlot = z.number().int().min(1).max(9)
const overrides = z.record(id, path)

export const LocalProjectRootSchema = z.object({ id, label: name, path }).strict()

const projectSchema = z
  .object({
    id,
    name,
    roots: z.array(LocalProjectRootSchema).min(1).max(64),
    defaultRootId: id,
    lastWorkspaceId: id.optional(),
    isArchived: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp
  })
  .strict()

const workspaceSchema = z
  .object({
    id,
    projectId: id,
    name,
    checkoutOverridesByRootId: overrides,
    defaultRootId: id.optional(),
    isArchived: z.boolean(),
    isUnread: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    markSlot: markSlot.optional(),
    lastActivityAt: timestamp.optional(),
    linearIssues: LocalWorkspaceLinearIssuesSchema.optional(),
    createdAt: timestamp,
    updatedAt: timestamp
  })
  .strict()

export const LocalProjectsStateSchema = z
  .object({
    version: z.literal(1),
    projects: z.array(projectSchema),
    workspaces: z.array(workspaceSchema)
  })
  .strict()
  .superRefine((state, context) => {
    const projectIds = new Set(state.projects.map((project) => project.id))
    const workspaceIds = new Set(state.workspaces.map((workspace) => workspace.id))
    if (
      projectIds.size !== state.projects.length ||
      workspaceIds.size !== state.workspaces.length
    ) {
      context.addIssue({ code: 'custom', message: 'Duplicate local Project or Workspace ID.' })
    }
    const markSlots = state.workspaces.flatMap((workspace) =>
      workspace.markSlot === undefined ? [] : [workspace.markSlot]
    )
    if (new Set(markSlots).size !== markSlots.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate local Workspace mark slot.' })
    }
    for (const project of state.projects) {
      const rootIds = new Set(project.roots.map((root) => root.id))
      if (rootIds.size !== project.roots.length || !rootIds.has(project.defaultRootId)) {
        context.addIssue({ code: 'custom', message: 'Invalid local Project roots.' })
      }
      if (
        project.lastWorkspaceId &&
        !state.workspaces.some(
          (workspace) =>
            workspace.id === project.lastWorkspaceId && workspace.projectId === project.id
        )
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Last Workspace does not belong to its Project.'
        })
      }
    }
    for (const workspace of state.workspaces) {
      const project = state.projects.find((entry) => entry.id === workspace.projectId)
      const rootIds = new Set(project?.roots.map((root) => root.id))
      if (
        !project ||
        (workspace.defaultRootId && !rootIds.has(workspace.defaultRootId)) ||
        Object.keys(workspace.checkoutOverridesByRootId).some((rootId) => !rootIds.has(rootId))
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid local Workspace root binding.' })
      }
    }
  })

export const CreateLocalProjectSchema = z
  .object({
    name,
    roots: z
      .array(z.object({ id: id.optional(), path, label: name.optional() }).strict())
      .min(1)
      .max(64),
    defaultRootId: id.optional()
  })
  .strict()

export const CreateLocalWorkspaceSchema = z
  .object({
    projectId: id,
    name,
    checkoutOverridesByRootId: overrides.optional(),
    defaultRootId: id.optional(),
    linearIssue: LocalWorkspaceLinearIssueSelectionSchema.optional()
  })
  .strict()

export const UpdateLocalProjectSchema = z
  .object({
    projectId: id,
    updates: z
      .object({
        name: name.optional(),
        isArchived: z.boolean().optional(),
        lastWorkspaceId: id.optional()
      })
      .strict()
  })
  .strict()

export const UpdateLocalWorkspaceSchema = z
  .object({
    workspaceId: id,
    updates: z
      .object({
        name: name.optional(),
        isArchived: z.boolean().optional(),
        isUnread: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        markSlot: z
          .union([markSlot, z.literal('next')])
          .nullable()
          .optional(),
        lastActivityAt: timestamp.optional()
      })
      .strict()
  })
  .strict()

export const LocalWorkspaceIdSchema = id

export function readLocalProjectsState(value: unknown): LocalProjectsState {
  if (value === undefined) {
    return emptyLocalProjectsState()
  }
  const result = LocalProjectsStateSchema.safeParse(value)
  if (!result.success) {
    throw new Error(
      'Local Project data is invalid or from an unsupported version; it has not been changed.'
    )
  }
  return result.data
}
