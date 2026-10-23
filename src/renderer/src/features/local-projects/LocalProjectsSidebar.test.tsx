// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  linearListIssues,
  linearSearchIssuesForTarget,
  linearStatusForTarget
} from '@/runtime/runtime-linear-client'
import type { LocalProjectsState, LocalWorkspace } from '../../../../shared/local-projects/types'
import { LocalProjectsSidebar } from './LocalProjectsSidebar'
import { LocalSidebarMarks } from './LocalSidebarMarks'
import { localLinearCatalog, localLinearLink } from './workspace-linear-picker-test-fixtures'

const mocks = vi.hoisted(() => {
  const agentRowsByWorktree: Record<string, { state: string }[]> = {}
  const git: { branch?: string } = { branch: 'main' }
  return { openLocalWorkspace: vi.fn(() => true), agentRowsByWorktree, git }
})
vi.mock('./local-workspace-sidebar-actions', () => ({
  openLocalWorkspace: mocks.openLocalWorkspace,
  requestLocalWorkspaceMarksList: vi.fn()
}))
vi.mock('./LocalContextActions', () => ({
  LocalContextActions: ({ children }: { children?: (menuButton: null) => unknown }) =>
    children ? children(null) : null
}))
vi.mock('@/components/sidebar/WorktreeCardAgents', () => ({
  default: ({ agents }: { agents: { state: string }[] }) =>
    agents.length > 0 ? (
      <div data-testid="agents">{agents.map((a) => a.state).join(',')}</div>
    ) : null
}))
vi.mock('@/components/sidebar/useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: (worktreeId: string) => mocks.agentRowsByWorktree[worktreeId] ?? []
}))
vi.mock('@/components/sidebar/use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'inactive'
}))
vi.mock('./use-local-root-git', () => ({
  useLocalRootGit: () => ({
    status: mocks.git.branch ? { entries: [{}], branch: mocks.git.branch } : null
  })
}))
vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatusForTarget: vi.fn(),
  linearSearchIssuesForTarget: vi.fn(),
  linearListIssues: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (value: ReturnType<typeof state>) => unknown) => selector(state()),
    { getState: state }
  )
}))

let catalog: LocalProjectsState = localLinearCatalog()
let activeWorktreeId = 'folder:workspace'
let folderWorkspaces: { id: string; isUnread: boolean; lastActivityAt: number }[] = []
const openModal = vi.fn()
function state() {
  return {
    localProjects: catalog,
    localProjectsLoaded: true,
    localProjectsError: null,
    folderWorkspaces,
    activeWorktreeId,
    openModal,
    fetchLocalProjects: vi.fn(async () => {})
  }
}

function addWorkspace(id: string, extra: Partial<LocalWorkspace> = {}): void {
  catalog.workspaces.push({
    id,
    projectId: 'project',
    name: id,
    checkoutOverridesByRootId: {},
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  })
}

function sidebar() {
  return (
    <TooltipProvider>
      <LocalSidebarMarks />
      <LocalProjectsSidebar />
    </TooltipProvider>
  )
}

const rowButton = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.clearAllMocks()
  catalog = localLinearCatalog()
  activeWorktreeId = 'folder:workspace'
  folderWorkspaces = []
  for (const key of Object.keys(mocks.agentRowsByWorktree)) {
    delete mocks.agentRowsByWorktree[key]
  }
  mocks.git.branch = 'main'
})
afterEach(cleanup)

describe('Local Projects sidebar', () => {
  it('drops the per-row "Link Linear issue" control and shows linked keys inline without reading Linear', () => {
    render(sidebar())
    expect(screen.queryByText('Link Linear issue')).toBeNull()
    cleanup()
    catalog = localLinearCatalog([
      localLinearLink(),
      { ...localLinearLink(), issueId: 'second', identifier: 'APP-2', title: 'Second' }
    ])
    render(sidebar())
    expect(within(rowButton(/^Main/)).getByText(/APP-1/).textContent).toBe('APP-1 +1')
    expect(linearStatusForTarget).not.toHaveBeenCalled()
    expect(linearListIssues).not.toHaveBeenCalled()
    expect(linearSearchIssuesForTarget).not.toHaveBeenCalled()
  })

  it('sorts Workspaces by live activity and opens them through the shared activation path', () => {
    addWorkspace('older', { lastActivityAt: 10 })
    addWorkspace('newer', { lastActivityAt: 5 })
    folderWorkspaces = [{ id: 'newer', isUnread: true, lastActivityAt: 50 }]
    render(sidebar())
    const list = screen.getByRole('region', { name: 'Application' })
    const order = Array.from(list.querySelectorAll('[data-worktree-id]')).map((button) =>
      button.getAttribute('data-worktree-id')
    )
    expect(order).toEqual(['folder:newer', 'folder:older', 'folder:workspace'])
    expect(rowButton(/^newer/).textContent).toContain('new activity')
    expect(rowButton(/^Main/).getAttribute('aria-current')).toBe('page')
    fireEvent.click(rowButton(/^older/))
    expect(mocks.openLocalWorkspace).toHaveBeenCalledExactlyOnceWith('older')
  })

  it('moves marked Workspaces into Marks with their slot and Project name', () => {
    addWorkspace('pinned', { markSlot: 3 })
    render(sidebar())
    const marks = screen.getByRole('list', { name: 'Marks' })
    expect(within(marks).getByText('pinned')).toBeTruthy()
    expect(within(marks).getByText('3')).toBeTruthy()
    expect(within(marks).getByText('Application')).toBeTruthy()
    const project = screen.getByRole('region', { name: 'Application' })
    expect(within(project).queryByText('pinned')).toBeNull()
  })

  it('hides Marks entirely when nothing is marked', () => {
    render(sidebar())
    expect(screen.queryByRole('list', { name: 'Marks' })).toBeNull()
  })

  it('folds idle agents into a count away from the open Workspace', () => {
    addWorkspace('background')
    mocks.agentRowsByWorktree['folder:background'] = [
      { state: 'working' },
      { state: 'idle' },
      { state: 'done' }
    ]
    mocks.agentRowsByWorktree['folder:workspace'] = [{ state: 'idle' }, { state: 'done' }]
    render(sidebar())
    // Same activity, so name order puts background first.
    expect(screen.getAllByTestId('agents').map((node) => node.textContent)).toEqual([
      'working',
      'idle,done'
    ])
    expect(within(rowButton(/^background/)).getByTitle('2 idle agents')).toBeTruthy()
  })

  it('shows a checkout override by folder name on its row', () => {
    addWorkspace('fix', { checkoutOverridesByRootId: { root: '/worktrees/app-fix' } })
    render(sidebar())
    expect(within(rowButton(/^fix/)).getByText('app-fix')).toBeTruthy()
  })

  it('shows the open Workspace roots, branch, and changes in the footer', () => {
    render(sidebar())
    const footer = screen.getByLabelText('Open Workspace directories')
    expect(within(footer).getByText('Root')).toBeTruthy()
    expect(within(footer).getByText('main')).toBeTruthy()
    expect(within(footer).getByTitle(/Uncommitted changes/)).toBeTruthy()
    activeWorktreeId = 'worktree:repo::/elsewhere'
    cleanup()
    render(sidebar())
    expect(screen.queryByLabelText('Open Workspace directories')).toBeNull()
  })

  it('reveals archived Workspaces only on request', () => {
    addWorkspace('gone', { isArchived: true })
    render(sidebar())
    expect(screen.queryByText(/^gone/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    expect(rowButton(/^gone \(Archived\)/)).toHaveProperty('disabled', true)
  })
})
