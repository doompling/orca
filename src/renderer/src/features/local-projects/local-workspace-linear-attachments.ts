import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState, LocalWorkspace } from '../../../../shared/local-projects/types'

export type LocalLinearWorkspaceTarget = {
  workspace: LocalWorkspace
  label: string
}

export function localLinearIssueAccount(
  issue: Pick<LinearIssue, 'workspaceId'>,
  hostId: string,
  accounts: readonly LinearWorkspace[]
): LinearWorkspace | null {
  if (hostId !== 'local' || !issue.workspaceId || issue.workspaceId === 'all') {
    return null
  }
  return accounts.find((account) => account.id === issue.workspaceId) ?? null
}

export function localLinearWorkspaceTargets(
  catalog: LocalProjectsState
): LocalLinearWorkspaceTarget[] {
  const projects = new Map(
    catalog.projects
      .filter((project) => !project.isArchived)
      .map((project) => [project.id, project])
  )
  return catalog.workspaces.flatMap((workspace) => {
    const project = projects.get(workspace.projectId)
    return project && !workspace.isArchived
      ? [{ workspace, label: `${project.name} / ${workspace.name}` }]
      : []
  })
}

export function localLinearIssueAttachments(
  targets: readonly LocalLinearWorkspaceTarget[],
  organizationId: string,
  issueId: string
): LocalLinearWorkspaceTarget[] {
  return targets.filter(({ workspace }) =>
    workspace.linearIssues?.some(
      (link) => link.organizationId === organizationId && link.issueId === issueId
    )
  )
}
