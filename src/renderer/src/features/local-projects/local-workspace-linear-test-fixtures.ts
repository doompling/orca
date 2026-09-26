import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import type { LocalWorkspaceLinearIssue } from '../../../../shared/local-projects/linear-issues'
import type { TaskSourceContext } from '../../../../shared/task-source-context'

export const localLinearAccount: LinearWorkspace = {
  id: 'account',
  organizationId: 'organization',
  organizationName: 'Engineering',
  displayName: 'Account',
  email: null
}
export const localLinearIssue: LinearIssue = {
  id: 'issue',
  workspaceId: 'account',
  identifier: 'ENG-1',
  title: 'Fixture issue',
  url: 'https://linear.app/engineering/issue/ENG-1/fixture',
  state: { name: 'Todo', type: 'unstarted', color: '' },
  team: { id: 'team', name: 'Engineering', key: 'ENG' },
  labels: [],
  labelIds: [],
  priority: 0,
  updatedAt: '2026-01-01T00:00:00.000Z'
}
export const localLinearSource: TaskSourceContext = {
  kind: 'task-source',
  provider: 'linear',
  hostId: 'local',
  projectId: 'tasks',
  providerIdentity: { provider: 'linear', workspaceId: 'account' }
}
export const localLinearLink: LocalWorkspaceLinearIssue = {
  linearWorkspaceId: 'account',
  organizationId: 'organization',
  issueId: 'issue',
  identifier: localLinearIssue.identifier,
  title: localLinearIssue.title,
  url: localLinearIssue.url,
  state: localLinearIssue.state,
  linkedAt: 1,
  refreshedAt: 1,
  sourceContextId: 'local'
}
export function localLinearCatalog(): LocalProjectsState {
  return {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [{ id: 'a', label: 'A', path: '/a' }],
        defaultRootId: 'a',
        createdAt: 1,
        updatedAt: 1,
        isArchived: false
      }
    ],
    workspaces: ['Main', 'Investigate', 'Unlinked'].map((name) => ({
      id: name.toLowerCase(),
      projectId: 'project',
      name,
      checkoutOverridesByRootId: {},
      createdAt: 1,
      updatedAt: 1,
      isArchived: false,
      linearIssues: name === 'Unlinked' ? [] : [{ ...localLinearLink }]
    }))
  }
}
