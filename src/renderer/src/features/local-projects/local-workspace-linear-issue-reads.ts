import { linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import {
  isLinearIssueUrlResolutionMatch,
  parseLinearIssueInput,
  parseLinearIssueUrlIntent
} from '../../../../shared/linear/links'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalWorkspaceLinearIssue } from '../../../../shared/local-projects/linear-issues'

export const LOCAL_WORKSPACE_LINEAR_SETTINGS = { activeRuntimeEnvironmentId: null }
export const LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT = 20

export async function readLocalWorkspaceLinearIssues(
  account: LinearWorkspace,
  query: string
): Promise<{ issues: LinearIssue[]; error: string | null }> {
  const term = query.trim()
  if (term.length < 2) {
    return { issues: [], error: null }
  }
  const url = parseLinearIssueUrlIntent(term)
  const parsed = parseLinearIssueInput(term)
  if (/^https?:\/\//i.test(term) && !url) {
    throw new Error('Paste a Linear issue URL, an issue identifier, or search by title.')
  }
  if (parsed) {
    if (
      url &&
      account.organizationUrlKey &&
      account.organizationUrlKey.toLowerCase() !== url.organizationUrlKey.toLowerCase()
    ) {
      throw new Error(
        'This issue URL belongs to another Linear account. Choose that account first.'
      )
    }
    const issue = await linearGetIssue(
      LOCAL_WORKSPACE_LINEAR_SETTINGS,
      parsed.identifier,
      account.id
    )
    if (!issue) {
      throw new Error(
        'Could not load this issue in the selected Linear account. Check the identifier and connection.'
      )
    }
    if (
      issue.workspaceId !== account.id ||
      issue.identifier.toUpperCase() !== parsed.identifier ||
      (url && !isLinearIssueUrlResolutionMatch(url, issue))
    ) {
      throw new Error('The issue did not match the selected Linear account or pasted link.')
    }
    return { issues: [issue], error: null }
  }
  const issues = await linearSearchIssues(
    LOCAL_WORKSPACE_LINEAR_SETTINGS,
    term,
    LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT,
    account.id
  )
  return {
    issues: issues
      .filter((issue) => issue.workspaceId === account.id)
      .slice(0, LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT),
    error: null
  }
}

export async function requireLocalWorkspaceLinearAccount(
  link: LocalWorkspaceLinearIssue
): Promise<LinearWorkspace> {
  const status = await linearStatus(LOCAL_WORKSPACE_LINEAR_SETTINGS)
  const account = status.workspaces?.find((entry) => entry.id === link.linearWorkspaceId)
  if (
    !status.connected ||
    status.credentialError ||
    !account ||
    account.organizationId !== link.organizationId
  ) {
    throw new Error(
      status.credentialError ??
        'Reconnect the original Linear account to load this issue. Saved details are unchanged.'
    )
  }
  return account
}

export async function readLocalWorkspaceLinkedIssue(
  link: LocalWorkspaceLinearIssue
): Promise<LinearIssue> {
  await requireLocalWorkspaceLinearAccount(link)
  const issue = await linearGetIssue(
    LOCAL_WORKSPACE_LINEAR_SETTINGS,
    link.issueId,
    link.linearWorkspaceId
  )
  if (!issue || issue.id !== link.issueId || issue.workspaceId !== link.linearWorkspaceId) {
    throw new Error(
      'Could not load this linked issue from its original Linear account. Saved details are unchanged.'
    )
  }
  return issue
}
