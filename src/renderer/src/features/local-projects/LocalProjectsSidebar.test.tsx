// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import type { DetachLocalWorkspaceLinearIssueArgs } from '../../../../shared/local-projects/linear-issues'
import { LocalProjectsSidebar } from './LocalProjectsSidebar'
import { localLinearCatalog, localLinearLink } from './workspace-linear-picker-test-fixtures'

const actions = vi.hoisted(() => ({
  activateLocalWorkspace: vi.fn(async () => {}),
  fetchLocalProjects: vi.fn(async () => {}),
  attachLocalWorkspaceLinearIssue: vi.fn(async () => {}),
  detachLocalWorkspaceLinearIssue:
    vi.fn<(args: DetachLocalWorkspaceLinearIssueArgs) => Promise<void>>(),
  openModal: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  openTaskPage: vi.fn()
}))
vi.mock('@/components/sidebar/WorktreeCardAgents', () => ({ default: () => null }))
vi.mock('./LocalContextActions', () => ({ LocalContextActions: () => null }))
vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(),
  linearSearchIssues: vi.fn(),
  linearListIssues: vi.fn()
}))
vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({ linearGetIssue: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (value: ReturnType<typeof state>) => unknown) => selector(state()),
    { getState: state }
  )
}))
let catalog = localLinearCatalog()
function state() {
  return {
    ...actions,
    localProjects: catalog,
    localProjectsLoaded: true,
    localProjectsError: null,
    activeWorktreeId: 'folder:workspace',
    activeOrcaProfileId: 'profile',
    orcaProfileSwitching: false
  }
}
function sidebar() {
  return (
    <TooltipProvider>
      <LocalProjectsSidebar />
    </TooltipProvider>
  )
}
function issueRow(identifier = 'APP-1', title = 'Fix the application', workspaceName = 'Main') {
  return screen.getByRole('button', {
    name: `Linear issue ${identifier}: ${title} for ${workspaceName}`
  })
}
function expectNoLinearReads() {
  expect(linearStatus).not.toHaveBeenCalled()
  expect(linearListIssues).not.toHaveBeenCalled()
  expect(linearSearchIssues).not.toHaveBeenCalled()
  expect(linearGetIssue).not.toHaveBeenCalled()
}
beforeEach(() => {
  vi.resetAllMocks()
  catalog = localLinearCatalog()
  actions.detachLocalWorkspaceLinearIssue.mockResolvedValue(undefined)
  vi.mocked(linearStatus).mockRejectedValue(new Error('Offline'))
})
afterEach(cleanup)

describe('Local Project sidebar Linear links', () => {
  it('offers a direct empty-state action and does not read Linear before opening it', async () => {
    render(sidebar())
    const trigger = screen.getByRole('button', { name: 'Link Linear issue to Main' })
    expect(trigger.textContent).toBe('Link Linear issue')
    expect(screen.queryByText('Workspace Linear issues')).toBeNull()
    expectNoLinearReads()

    fireEvent.click(trigger)
    expect(await screen.findByText('Workspace Linear issues')).toBeTruthy()
    expect(screen.getByText('No linked issues.')).toBeTruthy()
    await screen.findByText('Offline')
    expect(linearStatus).toHaveBeenCalledExactlyOnceWith({ activeRuntimeEnvironmentId: null })
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
  })

  it('shows the saved identifier and title for one issue even while offline', async () => {
    catalog = localLinearCatalog([localLinearLink()])
    render(sidebar())
    const trigger = issueRow()
    expect(within(trigger).getByText('APP-1')).toBeTruthy()
    expect(within(trigger).getByText('Fix the application')).toBeTruthy()
    expect(within(trigger).queryByText(/^\+/)).toBeNull()
    expectNoLinearReads()

    fireEvent.click(trigger)
    await screen.findByText('Offline')
    expect(screen.getByText('APP-1 · Fix the application')).toBeTruthy()
    expect(screen.getByText('Saved snapshot')).toBeTruthy()
    expect(linearListIssues).not.toHaveBeenCalled()
    expect(linearGetIssue).not.toHaveBeenCalled()
  })

  it('shows a row for every issue, including matching identifiers from different organizations', async () => {
    catalog = localLinearCatalog([
      localLinearLink(),
      { ...localLinearLink(), issueId: 'second', identifier: 'APP-2', title: 'Second task' },
      { ...localLinearLink(), organizationId: 'other-org', title: 'Other organization task' }
    ])
    render(sidebar())
    expect(screen.getAllByRole('button', { name: /^Linear issue / })).toHaveLength(3)
    expect(within(issueRow()).getByText('APP-1')).toBeTruthy()
    const second = issueRow('APP-2', 'Second task')
    expect(within(second).getByText('APP-2')).toBeTruthy()
    expect(within(second).getByText('Second task')).toBeTruthy()
    expect(
      within(issueRow('APP-1', 'Other organization task')).getByText('Other organization task')
    ).toBeTruthy()
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
    expectNoLinearReads()

    fireEvent.click(second)
    const links = await screen.findByRole('list', { name: 'Linked Linear issues' })
    expect(within(links).getAllByRole('listitem')).toHaveLength(3)
    expect(within(links).getByText('APP-2 · Second task')).toBeTruthy()
    expect(within(links).getByText('APP-1 · Other organization task')).toBeTruthy()
    await screen.findByText('Offline')
  })

  it('opens another Workspace issue manager without changing the current Workspace', async () => {
    catalog.workspaces.push({
      ...catalog.workspaces[0],
      id: 'review',
      name: 'Review',
      linearIssues: [localLinearLink()]
    })
    render(sidebar())
    const main = screen.getByRole('button', { name: 'Main Root' })
    const review = screen.getByRole('button', { name: 'Review Root' })
    expect(main.getAttribute('aria-current')).toBe('page')
    expectNoLinearReads()

    fireEvent.click(issueRow('APP-1', 'Fix the application', 'Review'))
    await screen.findByText('Offline')
    expect(screen.getByText(/^Review\. Linking/)).toBeTruthy()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
    expect(main.getAttribute('aria-current')).toBe('page')
    expect(review.getAttribute('aria-current')).toBeNull()
  })

  it('rerenders saved changes immediately and removes the summary after the final unlink', async () => {
    const view = render(sidebar())
    expect(screen.getByRole('button', { name: 'Link Linear issue to Main' })).toBeTruthy()
    catalog = localLinearCatalog([localLinearLink()])
    view.rerender(sidebar())
    expect(issueRow()).toBeTruthy()

    catalog.workspaces[0].linearIssues = [{ ...localLinearLink(), title: 'Updated saved title' }]
    view.rerender(sidebar())
    const trigger = issueRow('APP-1', 'Updated saved title')
    expect(within(trigger).getByText('Updated saved title')).toBeTruthy()
    expect(within(trigger).queryByText('Fix the application')).toBeNull()
    expectNoLinearReads()
    fireEvent.click(trigger)
    await screen.findByText('Offline')
    actions.detachLocalWorkspaceLinearIssue.mockImplementation(async () => {
      catalog = localLinearCatalog()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlink APP-1' }))
    await waitFor(() =>
      expect(actions.detachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'workspace',
        organizationId: 'org',
        issueId: 'issue'
      })
    )
    view.rerender(sidebar())
    expect(screen.getByRole('button', { name: 'Link Linear issue to Main' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Linear issue / })).toBeNull()
    expect(screen.getByText('No linked issues.')).toBeTruthy()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
  })

  it.each(['Workspace', 'Project'])(
    'hides empty archived %s actions but keeps saved links',
    async (kind) => {
      catalog.workspaces.push({
        ...catalog.workspaces[0],
        id: 'saved',
        name: 'Saved',
        linearIssues: [localLinearLink()]
      })
      if (kind === 'Project') {
        catalog.projects[0].isArchived = true
      } else {
        catalog.workspaces.forEach((workspace) => {
          workspace.isArchived = true
        })
      }
      render(sidebar())
      expect(screen.queryByRole('button', { name: /^Linear issue .* for Saved$/ })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))
      expect(screen.queryByRole('button', { name: 'Link Linear issue to Main' })).toBeNull()
      expect(screen.queryByText('0', { exact: true })).toBeNull()
      const trigger = issueRow('APP-1', 'Fix the application', 'Saved')
      expect(trigger).toHaveProperty('disabled', false)
      fireEvent.click(trigger)
      expect(await screen.findByText('APP-1 · Fix the application')).toBeTruthy()
      expect(screen.getByText('Open an active Workspace to link another issue.')).toBeTruthy()
      expect(screen.queryByPlaceholderText('Search Linear issues…')).toBeNull()
      expectNoLinearReads()
    }
  )
})
