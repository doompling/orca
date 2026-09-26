import { z } from 'zod'
import { LocalProjectRootSchema, LocalWorkspaceIdSchema } from './schema'
import { isSafeGitRefName } from '../git-status-upstream-ref'

export const CreateLocalRootWorktreeSchema = z
  .object({
    projectId: LocalWorkspaceIdSchema,
    rootId: LocalWorkspaceIdSchema,
    expectedRootPath: LocalProjectRootSchema.shape.path,
    path: LocalProjectRootSchema.shape.path,
    branchName: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .refine(
        (branch) => !branch.startsWith('-') && isSafeGitRefName(`refs/heads/${branch}`),
        'Choose a valid new Git branch name.'
      )
  })
  .strict()

export type CreateLocalRootWorktreeArgs = z.infer<typeof CreateLocalRootWorktreeSchema>

export type CreateLocalRootWorktreeResult = {
  projectId: string
  rootId: string
  sourcePath: string
  path: string
  branchName: string
  baseCommit: string
}
