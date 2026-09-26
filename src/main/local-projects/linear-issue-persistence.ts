import type { LocalProjectsState, LocalWorkspace } from '../../shared/local-projects/types'
import {
  DetachLocalWorkspaceLinearIssueSchema,
  LocalWorkspaceLinearIssueSchema,
  localWorkspaceLinearIssueKey,
  MAX_LOCAL_WORKSPACE_LINEAR_ISSUES,
  type DetachLocalWorkspaceLinearIssueArgs,
  type LocalWorkspaceLinearIssue
} from '../../shared/local-projects/linear-issues'

type Catalog = {
  getLocalProjectsSnapshot(): LocalProjectsState
}

export function requireLocalLinearLinkWorkspace(
  state: LocalProjectsState,
  workspaceId: string
): LocalWorkspace {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId)
  const project = state.projects.find((entry) => entry.id === workspace?.projectId)
  if (!workspace || workspace.isArchived || !project || project.isArchived) {
    throw new Error('Choose an active local Workspace to link this Linear issue.')
  }
  return workspace
}

export function attachLocalWorkspaceLinearIssue(
  owner: Catalog,
  workspaceId: string,
  input: LocalWorkspaceLinearIssue,
  commit: (state: LocalProjectsState) => void
): LocalWorkspace {
  const issue = LocalWorkspaceLinearIssueSchema.parse(input)
  const current = owner.getLocalProjectsSnapshot()
  const workspace = requireLocalLinearLinkWorkspace(current, workspaceId)
  const links = workspace.linearIssues ?? []
  const key = localWorkspaceLinearIssueKey(issue)
  const previous = links.find((entry) => localWorkspaceLinearIssueKey(entry) === key)
  if (!previous && links.length >= MAX_LOCAL_WORKSPACE_LINEAR_ISSUES) {
    throw new Error(
      `A Workspace can link at most ${MAX_LOCAL_WORKSPACE_LINEAR_ISSUES} Linear issues.`
    )
  }
  const saved = { ...issue, linkedAt: previous?.linkedAt ?? issue.linkedAt }
  const updated = {
    ...workspace,
    linearIssues: previous
      ? links.map((entry) => (localWorkspaceLinearIssueKey(entry) === key ? saved : entry))
      : [...links, saved],
    updatedAt: Math.max(workspace.updatedAt, Date.now())
  }
  commit({
    ...current,
    workspaces: current.workspaces.map((entry) => (entry.id === workspaceId ? updated : entry))
  })
  return structuredClone(updated)
}

export function detachLocalWorkspaceLinearIssue(
  owner: Catalog,
  input: DetachLocalWorkspaceLinearIssueArgs,
  commit: (state: LocalProjectsState) => void
): LocalWorkspace {
  const args = DetachLocalWorkspaceLinearIssueSchema.parse(input)
  const current = owner.getLocalProjectsSnapshot()
  const workspace = current.workspaces.find((entry) => entry.id === args.workspaceId)
  if (!workspace) {
    throw new Error('Local Workspace not found.')
  }
  const key = localWorkspaceLinearIssueKey(args)
  const links = workspace.linearIssues ?? []
  const retained = links.filter((entry) => localWorkspaceLinearIssueKey(entry) !== key)
  if (retained.length === links.length) {
    return structuredClone(workspace)
  }
  const updated = {
    ...workspace,
    linearIssues: retained,
    updatedAt: Math.max(workspace.updatedAt, Date.now())
  }
  commit({
    ...current,
    workspaces: current.workspaces.map((entry) => (entry.id === args.workspaceId ? updated : entry))
  })
  return structuredClone(updated)
}
