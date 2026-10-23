import { normalizeStoredTaskSourceContext } from '../../../../shared/task-source-context'
import { parseLinearIssueUrlIntent } from '../../../../shared/linear/links'
import {
  LocalWorkspaceLinearIssueSelectionSchema,
  type LocalWorkspaceLinearIssueSelection
} from '../../../../shared/local-projects/linear-issues'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import { buildLinearIssueLinkedWorkItem } from '@/lib/linear-linked-work-item'

/** Composer data naming the exact Linear issue a new local Workspace links to. */
export function localWorkspaceComposerIssueData(issue: Pick<LinearIssue, 'id' | 'workspaceId'>): {
  linearIssue?: LocalWorkspaceLinearIssueSelection
} {
  return issue.workspaceId
    ? { linearIssue: { linearWorkspaceId: issue.workspaceId, issueId: issue.id } }
    : {}
}

/** Composer data for a Workspace from a Linear issue: its linked work item and exact issue. */
export function linearIssueComposerData(issue: LinearIssue) {
  return {
    linkedWorkItem: buildLinearIssueLinkedWorkItem(issue),
    ...localWorkspaceComposerIssueData(issue)
  }
}

export function readLocalWorkspaceComposerIssue(data: Record<string, unknown>) {
  const parsed = LocalWorkspaceLinearIssueSelectionSchema.safeParse(data.linearIssue)
  return parsed.success ? parsed.data : undefined
}

export function usesLocalWorkspaceComposer(data: Record<string, unknown>): boolean {
  if (data.taskSourceContext != null) {
    const context = normalizeStoredTaskSourceContext(data.taskSourceContext)
    if (!context || context.hostId !== 'local') {
      return false
    }
  }
  if (data.initialEphemeralVmRecipeId || data.initialProjectGroupId || data.initialGitHubWorkItem) {
    return false
  }
  const item = data.linkedWorkItem
  if (item != null) {
    return (
      typeof item === 'object' &&
      'provider' in item &&
      item.provider === 'linear' &&
      readLocalWorkspaceComposerIssue(data) !== undefined
    )
  }
  return !(
    data.initialRepoId ||
    (typeof data.prefilledName === 'string' && parseLinearIssueUrlIntent(data.prefilledName))
  )
}

export function localWorkspaceComposerIssueLabel(data: Record<string, unknown>): string | null {
  if (!readLocalWorkspaceComposerIssue(data)) {
    return null
  }
  const item = data.linkedWorkItem
  if (!item || typeof item !== 'object') {
    return null
  }
  const identifier =
    'linearIdentifier' in item && typeof item.linearIdentifier === 'string'
      ? item.linearIdentifier
      : ''
  const title = 'title' in item && typeof item.title === 'string' ? item.title : ''
  return [identifier, title].filter(Boolean).join(' · ') || null
}
