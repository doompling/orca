import type { LinearIssue } from '../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../shared/linear/workspace-types'
import {
  AttachLocalWorkspaceLinearIssueSchema,
  type AttachLocalWorkspaceLinearIssueArgs,
  type LocalWorkspaceLinearIssue
} from '../../shared/local-projects/linear-issues'
import type { LocalProjectsState, LocalWorkspace } from '../../shared/local-projects/types'
import { getIssue } from '../linear/linear-issue-lookups'
import { getWorkspaceState } from '../linear/linear-workspace-registry'
import { requireLocalLinearLinkWorkspace } from './linear-issue-persistence'

type LinkOwner = {
  getLocalProjectsSnapshot(): LocalProjectsState
  attachLocalWorkspaceLinearIssue(
    workspaceId: string,
    issue: LocalWorkspaceLinearIssue
  ): LocalWorkspace
}

type LinearIssueReader = {
  getWorkspaces(): LinearWorkspace[]
  getIssue(issueId: string, linearWorkspaceId: string): Promise<LinearIssue | null>
}

const localLinearReader: LinearIssueReader = {
  getWorkspaces: () => getWorkspaceState().workspaces,
  getIssue
}

export async function linkLocalWorkspaceLinearIssue(
  owner: LinkOwner,
  input: AttachLocalWorkspaceLinearIssueArgs,
  reader: LinearIssueReader = localLinearReader
): Promise<LocalWorkspace> {
  const args = AttachLocalWorkspaceLinearIssueSchema.parse(input)
  requireLocalLinearLinkWorkspace(owner.getLocalProjectsSnapshot(), args.workspaceId)
  const account = reader.getWorkspaces().find((entry) => entry.id === args.linearWorkspaceId)
  if (!account?.organizationId || account.organizationId === 'legacy') {
    throw new Error('Connect this Linear account in Settings before linking its issues.')
  }
  const organizationId = account.organizationId
  const credentialRevision = account.credentialRevision
  const issue = await reader.getIssue(args.issueId, args.linearWorkspaceId)
  const currentAccount = reader.getWorkspaces().find((entry) => entry.id === args.linearWorkspaceId)
  if (
    !currentAccount ||
    currentAccount.organizationId !== organizationId ||
    currentAccount.credentialRevision !== credentialRevision
  ) {
    throw new Error('The Linear account changed while loading the issue. Try again.')
  }
  if (!issue) {
    throw new Error('Could not verify this Linear issue. Check the connection and try again.')
  }
  if (issue.id !== args.issueId || issue.workspaceId !== args.linearWorkspaceId) {
    throw new Error('The Linear issue did not match the selected account. Search for it again.')
  }
  const now = Date.now()
  return owner.attachLocalWorkspaceLinearIssue(args.workspaceId, {
    linearWorkspaceId: args.linearWorkspaceId,
    organizationId,
    issueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: { ...issue.state },
    linkedAt: now,
    refreshedAt: now,
    sourceContextId: 'local'
  })
}
