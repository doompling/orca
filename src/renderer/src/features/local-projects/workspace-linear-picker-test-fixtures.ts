import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearConnectionStatus } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import type { LocalWorkspaceLinearIssue } from '../../../../shared/local-projects/linear-issues'

export function localLinearStatus(): LinearConnectionStatus {
  return {
    connected: true,
    viewer: null,
    workspaces: [
      {
        id: 'account',
        organizationId: 'org',
        organizationName: 'Example',
        displayName: 'Member',
        email: null
      }
    ]
  }
}

export function localLinearIssue(id = 'issue', accountId = 'account'): LinearIssue {
  return {
    id,
    workspaceId: accountId,
    identifier: 'APP-1',
    title: 'Fix the application',
    url: 'https://linear.app/example/issue/APP-1/fix',
    state: { name: 'In Progress', type: 'started', color: '' },
    team: { id: 'team', name: 'Application', key: 'APP' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: '2026-09-26T00:00:00.000Z'
  }
}

export function localLinearLink(): LocalWorkspaceLinearIssue {
  const issue = localLinearIssue()
  return {
    linearWorkspaceId: 'account',
    organizationId: 'org',
    issueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    linkedAt: 1,
    refreshedAt: 2,
    sourceContextId: 'local'
  }
}

export function localLinearCatalog(links: LocalWorkspaceLinearIssue[] = []): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [{ id: 'root', label: 'Root', path: '/app' }],
        defaultRootId: 'root',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces: [
      {
        id: 'workspace',
        projectId: 'project',
        name: 'Main',
        checkoutOverridesByRootId: {},
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
        linearIssues: links
      }
    ]
  }
}
