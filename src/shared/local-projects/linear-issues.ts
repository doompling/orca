import { z } from 'zod'
import { parseLinearIssueUrlIntent } from '../linear/links'

const id = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => !value.includes('\0'))
const text = z.string().trim().min(1).max(2048)
const timestamp = z.number().finite().nonnegative()

export const MAX_LOCAL_WORKSPACE_LINEAR_ISSUES = 100

export const LocalWorkspaceLinearIssueSchema = z
  .object({
    linearWorkspaceId: id.refine((value) => value !== 'all'),
    organizationId: id,
    issueId: id,
    identifier: id,
    title: text,
    url: z
      .string()
      .max(8192)
      .refine((value) => parseLinearIssueUrlIntent(value) !== null),
    state: z.object({ name: text, type: id, color: z.string().max(128) }).strict(),
    linkedAt: timestamp,
    refreshedAt: timestamp,
    sourceContextId: z.literal('local')
  })
  .strict()

export type LocalWorkspaceLinearIssue = z.infer<typeof LocalWorkspaceLinearIssueSchema>

export const AttachLocalWorkspaceLinearIssueSchema = z
  .object({
    workspaceId: id,
    linearWorkspaceId: id.refine((value) => value !== 'all'),
    issueId: id
  })
  .strict()

export const DetachLocalWorkspaceLinearIssueSchema = z
  .object({
    workspaceId: id,
    organizationId: id,
    issueId: id
  })
  .strict()

export type AttachLocalWorkspaceLinearIssueArgs = z.infer<
  typeof AttachLocalWorkspaceLinearIssueSchema
>
export type DetachLocalWorkspaceLinearIssueArgs = z.infer<
  typeof DetachLocalWorkspaceLinearIssueSchema
>

export function localWorkspaceLinearIssueKey(
  issue: Pick<LocalWorkspaceLinearIssue, 'organizationId' | 'issueId'>
): string {
  return `${encodeURIComponent(issue.organizationId)}:${encodeURIComponent(issue.issueId)}`
}

export const LocalWorkspaceLinearIssuesSchema = z
  .array(LocalWorkspaceLinearIssueSchema)
  .max(MAX_LOCAL_WORKSPACE_LINEAR_ISSUES)
  .refine(
    (issues) => new Set(issues.map(localWorkspaceLinearIssueKey)).size === issues.length,
    'A Linear issue can only be linked once in a Workspace.'
  )
