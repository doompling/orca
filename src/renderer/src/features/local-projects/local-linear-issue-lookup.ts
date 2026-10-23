import type { LinearIssue } from '../../../../shared/linear/issue-types'

/** One issue from this host's Linear account; local Workspace links never route elsewhere. */
export function getLocalLinearIssue(id: string, workspaceId: string): Promise<LinearIssue | null> {
  return window.api.linear.getIssue({ id, workspaceId })
}
