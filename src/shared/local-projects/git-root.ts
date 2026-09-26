import { z } from 'zod'
import { LocalWorkspaceIdSchema } from './schema'

export const LocalWorkspaceGitRootSchema = z
  .object({
    workspaceId: LocalWorkspaceIdSchema,
    rootId: LocalWorkspaceIdSchema
  })
  .strict()

export type LocalWorkspaceGitRoot = z.infer<typeof LocalWorkspaceGitRootSchema>

export const LOCAL_ROOT_GIT_UNAVAILABLE =
  'This root is not a Git checkout, or Git could not inspect it.'
export const LOCAL_ROOT_GIT_SUBDIRECTORY =
  'Select the checkout root to use Source Control; this directory is inside another repository.'
