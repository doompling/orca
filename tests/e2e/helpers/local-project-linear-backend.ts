import type { ElectronApplication, Page } from '@stablyai/playwright-test'

export const LOCAL_PROJECT_LINEAR_FIXTURE = {
  organization: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Fixture Engineering',
    urlKey: 'ether-fixture'
  },
  viewer: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Fixture User',
    displayName: 'Fixture User',
    email: 'fixture@example.test'
  },
  team: { id: '33333333-3333-4333-8333-333333333333', name: 'Engineering', key: 'ENG' },
  state: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Todo',
    type: 'unstarted',
    color: '#999999',
    position: 0
  },
  issues: [
    {
      id: '55555555-5555-4555-8555-555555555551',
      identifier: 'ENG-101',
      title: 'Shared sign-in investigation'
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      identifier: 'ENG-102',
      title: 'Main-only recovery checks'
    },
    {
      id: '55555555-5555-4555-8555-555555555553',
      identifier: 'ENG-103',
      title: 'Unattached backlog task'
    }
  ]
}

type LinearFixture = typeof LOCAL_PROJECT_LINEAR_FIXTURE

export function installLocalProjectLinearFetch(_electron: unknown, fixture: LinearFixture): void {
  const originalFetch = globalThis.fetch
  const pageInfo = {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null
  }
  const collection = (nodes: unknown[]) => ({ nodes, pageInfo })
  const issueRecords = fixture.issues.map((issue) => ({
    ...issue,
    __typename: 'Issue',
    description: 'Scripted acceptance fixture; no real Linear issue.',
    url: `https://linear.app/ether-fixture/issue/${issue.identifier}/fixture`,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    priority: 2,
    estimate: null,
    dueDate: null,
    archivedAt: null,
    state: fixture.state,
    team: fixture.team,
    assignee: null,
    project: null,
    labels: collection([]),
    labelIds: [],
    children: collection([]),
    reactions: [],
    sharedAccess: { isShared: false, sharedWithUsers: [] }
  }))
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    )
    if (url.hostname !== 'api.linear.app') {
      return originalFetch(input, init)
    }
    if (url.pathname !== '/graphql' || init?.method !== 'POST' || typeof init.body !== 'string') {
      throw new Error('Unexpected Linear fixture transport request; no network request was sent.')
    }
    const request: unknown = JSON.parse(init.body)
    if (
      !request ||
      typeof request !== 'object' ||
      !('query' in request) ||
      typeof request.query !== 'string'
    ) {
      throw new Error('Invalid Linear fixture request.')
    }
    const operation = /\bquery\s+(\w+)/.exec(request.query)?.[1]
    if (!operation || /\bmutation\s/.test(request.query)) {
      throw new Error('Linear fixture refuses all provider mutations.')
    }
    const variables =
      'variables' in request && request.variables && typeof request.variables === 'object'
        ? request.variables
        : {}
    const requestedId = 'id' in variables ? variables.id : null
    const issue = issueRecords.find(
      (entry) => entry.id === requestedId || entry.identifier === requestedId
    )
    let data: unknown
    switch (operation) {
      case 'viewer':
        data = { viewer: fixture.viewer }
        break
      case 'organization':
        data = { organization: { ...fixture.organization, projectStatuses: [] } }
        break
      case 'issue':
        data = { issue: issue ?? null }
        break
      case 'issue_labels':
        data = { issue: { labels: collection([]) } }
        break
      case 'issue_children':
        data = { issue: { children: collection([]) } }
        break
      case 'workflowState':
        data = { workflowState: fixture.state }
        break
      case 'team':
        data = { team: fixture.team }
        break
      case 'teams':
        data = { teams: collection([fixture.team]) }
        break
      case 'team_states':
        data = { team: { states: collection([fixture.state]) } }
        break
      case 'team_labels':
        data = { team: { labels: collection([]) } }
        break
      case 'team_members':
        data = { team: { members: collection([fixture.viewer]) } }
        break
      case 'OrcaLinearIssueSearch': {
        const term =
          'term' in variables && typeof variables.term === 'string'
            ? variables.term.toLowerCase()
            : ''
        data = {
          searchIssues: collection(
            issueRecords.filter((entry) =>
              `${entry.identifier} ${entry.title}`.toLowerCase().includes(term)
            )
          )
        }
        break
      }
      case 'OrcaLinearIssues':
        data = { issues: collection(issueRecords) }
        break
      case 'OrcaLinearViewerAssignedIssues':
        data = { viewer: { assignedIssues: collection(issueRecords) } }
        break
      case 'OrcaLinearViewerCreatedIssues':
        data = { viewer: { createdIssues: collection(issueRecords) } }
        break
      case 'OrcaLinearProjects':
        data = { projects: collection([]) }
        break
      case 'OrcaLinearCustomViews':
        data = { customViews: collection([]) }
        break
      default:
        throw new Error(`Unsupported Linear fixture query: ${operation}`)
    }
    return Response.json({ data })
  }
}

export async function connectLocalProjectLinearFixture(
  app: ElectronApplication,
  page: Page
): Promise<void> {
  await app.evaluate(installLocalProjectLinearFetch, LOCAL_PROJECT_LINEAR_FIXTURE)
  const connected = await page.evaluate(async () => {
    const result = await window.api.linear.connect({
      apiKey: 'lin_api_ether_fixture_not_a_real_credential'
    })
    if (!result.ok) {
      throw new Error(result.error)
    }
    await window.__store?.getState().checkLinearConnection(true)
    return result.ok
  })
  if (!connected) {
    throw new Error('Scripted Linear connection did not initialize.')
  }
}
