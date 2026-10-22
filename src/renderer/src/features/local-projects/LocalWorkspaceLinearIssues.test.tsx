// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import {
  LocalWorkspaceLinearIssues,
  LocalWorkspaceLinearIssuesContent
} from './LocalWorkspaceLinearIssues'
import {
  localLinearCatalog,
  localLinearIssue,
  localLinearLink,
  localLinearStatus
} from './workspace-linear-picker-test-fixtures'
import { LocalContextActions } from './LocalContextActions'
import { LocalWorkspaceShortcuts } from './LocalWorkspaceShortcuts'

const actions = vi.hoisted(() => ({
  attachLocalWorkspaceLinearIssue: vi.fn(async () => {}),
  detachLocalWorkspaceLinearIssue: vi.fn(async () => {}),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn()
}))
vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(),
  linearSearchIssues: vi.fn(),
  linearListIssues: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (value: ReturnType<typeof currentState>) => unknown) => selector(currentState()),
    { getState: currentState }
  )
}))
let catalog = localLinearCatalog()
let switching = false
function currentState() {
  return {
    ...actions,
    localProjects: catalog,
    activeOrcaProfileId: 'profile',
    orcaProfileSwitching: switching
  }
}
const openUrl = vi.fn(async () => {})
beforeEach(() => {
  catalog = localLinearCatalog()
  switching = false
  vi.clearAllMocks()
  vi.mocked(linearStatus).mockResolvedValue(localLinearStatus())
  vi.mocked(linearSearchIssues).mockResolvedValue([localLinearIssue()])
  vi.mocked(linearListIssues).mockResolvedValue({ items: [localLinearIssue()] })
  vi.stubGlobal('api', { shell: { openUrl } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function content() {
  return render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={() => {}} />)
}

describe('Workspace Linear issue controls', () => {
  it('offers the visible popover and links an exact searched issue without closing', async () => {
    render(<LocalWorkspaceLinearIssues workspaceId="workspace" />)
    fireEvent.click(screen.getByRole('button', { name: 'Linear issues (0)' }))
    await screen.findByText('Workspace Linear issues')
    const input = await screen.findByPlaceholderText('Search Linear issues…')
    fireEvent.change(input, { target: { value: 'APP' } })
    fireEvent.click(await screen.findByRole('option', { name: /APP-1.*Fix the application/ }))
    await waitFor(() =>
      expect(actions.attachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'workspace',
        linearWorkspaceId: 'account',
        issueId: 'issue'
      })
    )
    expect(screen.getByText('Workspace Linear issues')).toBeTruthy()
    expect(actions.detachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('keeps snapshots visible offline and unlinks only this Workspace', async () => {
    catalog = localLinearCatalog([localLinearLink()])
    vi.mocked(linearStatus).mockRejectedValue(new Error('Offline'))
    content()
    expect(screen.getByText('APP-1 · Fix the application')).toBeTruthy()
    expect(screen.getByText('In Progress')).toBeTruthy()
    expect(screen.getByText('Saved snapshot')).toBeTruthy()
    await screen.findByText('Offline')
    fireEvent.click(screen.getByRole('button', { name: 'Unlink APP-1' }))
    await waitFor(() =>
      expect(actions.detachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'workspace',
        organizationId: 'org',
        issueId: 'issue'
      })
    )
    expect(linearSearchIssues).not.toHaveBeenCalled()
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('opens the saved Linear URL and does not change link or provider metadata', async () => {
    catalog = localLinearCatalog([localLinearLink()])
    content()
    fireEvent.click(screen.getByRole('button', { name: 'Open APP-1 in Linear' }))
    expect(openUrl).toHaveBeenCalledExactlyOnceWith(localLinearLink().url)
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
    expect(actions.detachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
    await screen.findByPlaceholderText('Search Linear issues…')
  })

  it('does not present an empty network result as proof there are no matching issues', async () => {
    vi.mocked(linearSearchIssues).mockResolvedValue([])
    content()
    fireEvent.change(await screen.findByPlaceholderText('Search Linear issues…'), {
      target: { value: 'missing' }
    })
    expect(
      await screen.findByText('No issues returned. Try another search or check the connection.')
    ).toBeTruthy()
  })

  it('retains stored links and shows an attach failure without optimistically adding it', async () => {
    actions.attachLocalWorkspaceLinearIssue.mockRejectedValueOnce(new Error('Issue unavailable'))
    content()
    fireEvent.change(await screen.findByPlaceholderText('Search Linear issues…'), {
      target: { value: 'APP' }
    })
    fireEvent.click(await screen.findByRole('option', { name: /APP-1/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Issue unavailable')
    expect(screen.getByText('No linked issues.')).toBeTruthy()
  })

  it('marks an existing organization/issue match linked even through another account', async () => {
    catalog = localLinearCatalog([{ ...localLinearLink(), linearWorkspaceId: 'previous-account' }])
    content()
    fireEvent.change(await screen.findByPlaceholderText('Search Linear issues…'), {
      target: { value: 'APP' }
    })
    const option = await screen.findByRole('option', { name: /APP-1.*Linked/ })
    expect(option.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(option)
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('keeps archived snapshots detachable without starting Linear reads', async () => {
    catalog = localLinearCatalog([localLinearLink()])
    catalog.workspaces[0].isArchived = true
    content()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink APP-1' }))
    await waitFor(() => expect(actions.detachLocalWorkspaceLinearIssue).toHaveBeenCalledOnce())
    expect(linearStatus).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Search Linear issues…')).toBeNull()
  })

  it('does not permit metadata actions during a profile switch', () => {
    catalog = localLinearCatalog([localLinearLink()])
    switching = true
    content()
    expect(screen.getByRole('button', { name: 'Unlink APP-1' })).toHaveProperty('disabled', true)
    expect(linearStatus).not.toHaveBeenCalled()
  })

  it('opens the same issue controls from the Workspace actions menu', async () => {
    render(
      <>
        <LocalContextActions kind="Workspace" record={catalog.workspaces[0]} />
        <LocalWorkspaceShortcuts />
      </>
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Workspace actions for Main' }), {
      button: 0,
      ctrlKey: false
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Linear issues…' }))
    expect(await screen.findByText('Workspace Linear issues')).toBeTruthy()
    expect(await screen.findByPlaceholderText('Search Linear issues…')).toBeTruthy()
  })
})
