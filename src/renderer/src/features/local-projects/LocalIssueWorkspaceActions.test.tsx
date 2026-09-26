// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalIssueWorkspaceActions } from './LocalIssueWorkspaceActions'
import { LocalIssueWorkspaceLinks } from './LocalIssueWorkspaceLinks'
import {
  localLinearAccount,
  localLinearCatalog,
  localLinearIssue,
  localLinearSource
} from './local-workspace-linear-test-fixtures'

const actions = vi.hoisted(() => ({
  attachLocalWorkspaceLinearIssue: vi.fn(async () => {}),
  activateLocalWorkspace: vi.fn(async () => {})
}))
let catalog = localLinearCatalog()
let account = localLinearAccount
let statusKey = 'local#0'
function state() {
  return {
    ...actions,
    localProjects: catalog,
    linearStatus: { connected: true, viewer: null, workspaces: [account] },
    linearStatusContextKey: statusKey,
    linearStatusChecked: true,
    settings: null
  }
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: ReturnType<typeof state>) => unknown) => selector(state())
}))
beforeEach(() => {
  vi.clearAllMocks()
  catalog = localLinearCatalog()
  account = localLinearAccount
  statusKey = 'local#0'
})
afterEach(cleanup)

function renderActions(
  props: Partial<React.ComponentProps<typeof LocalIssueWorkspaceActions>> = {}
) {
  return render(
    <LocalIssueWorkspaceActions
      issue={localLinearIssue}
      sourceContext={localLinearSource}
      {...props}
    >
      <button>Legacy action</button>
    </LocalIssueWorkspaceActions>
  )
}
function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Workspaces for ENG-1' }))
}

describe('Tasks local Workspace actions', () => {
  it('does not pick an arbitrary attachment and opens only the chosen Workspace', async () => {
    renderActions()
    expect(screen.getByRole('button', { name: 'Workspaces for ENG-1' }).textContent).toContain(
      'Workspaces (2)'
    )
    openPicker()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Application / Main' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: 'Application / Investigate' }))
    await waitFor(() =>
      expect(actions.activateLocalWorkspace).toHaveBeenCalledExactlyOnceWith('investigate')
    )
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('attaches to the explicit target without activating it or starting an agent', async () => {
    renderActions()
    openPicker()
    fireEvent.click(screen.getByRole('option', { name: 'Application / Unlinked' }))
    await waitFor(() =>
      expect(actions.attachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'unlinked',
        linearWorkspaceId: 'account',
        issueId: 'issue'
      })
    )
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByPlaceholderText('Search Workspaces…')).toBeNull())
  })

  it('searches by Project and Workspace labels and cancelling writes nothing', async () => {
    renderActions()
    openPicker()
    fireEvent.change(screen.getByPlaceholderText('Search Workspaces…'), {
      target: { value: 'Investigate' }
    })
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Application / Main' })).toBeNull()
    )
    expect(screen.getByRole('option', { name: 'Application / Investigate' })).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('Search Workspaces…'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByPlaceholderText('Search Workspaces…')).toBeNull())
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
  })

  it('keeps a failed attachment open with a readable error', async () => {
    actions.attachLocalWorkspaceLinearIssue.mockRejectedValueOnce(
      new Error('Linear account is disconnected.')
    )
    renderActions()
    openPicker()
    fireEvent.click(screen.getByRole('option', { name: 'Application / Unlinked' }))
    expect((await screen.findByRole('alert')).textContent).toContain('disconnected')
    expect(screen.getByPlaceholderText('Search Workspaces…')).toBeTruthy()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
  })

  it('retains the legacy attachment action alongside canonical links', () => {
    const legacy = vi.fn()
    renderActions({ legacyWorkspaceLabel: 'Original checkout', onOpenLegacyWorkspace: legacy })
    openPicker()
    fireEvent.click(screen.getByRole('option', { name: 'Original checkout' }))
    expect(legacy).toHaveBeenCalledOnce()
    expect(actions.activateLocalWorkspace).not.toHaveBeenCalled()
  })

  it('leaves remote issue actions unchanged', () => {
    renderActions({ sourceContext: { ...localLinearSource, hostId: 'runtime:server' } })
    expect(screen.getByRole('button', { name: 'Legacy action' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Workspaces for ENG-1' })).toBeNull()
  })

  it('does not use remote account metadata or an unrelated local account', () => {
    statusKey = 'runtime:remote#0'
    const view = renderActions()
    expect(screen.getByRole('button', { name: 'Legacy action' })).toBeTruthy()
    view.unmount()
    statusKey = 'local#0'
    account = { ...localLinearAccount, id: 'another-account' }
    renderActions()
    expect(screen.getByRole('button', { name: 'Legacy action' })).toBeTruthy()
  })

  it('lists every linked Project / Workspace in issue details', async () => {
    render(
      <LocalIssueWorkspaceLinks issue={localLinearIssue} sourceContext={localLinearSource}>
        None yet
      </LocalIssueWorkspaceLinks>
    )
    expect(screen.getByRole('button', { name: 'Application / Main' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Application / Investigate' }))
    await waitFor(() =>
      expect(actions.activateLocalWorkspace).toHaveBeenCalledExactlyOnceWith('investigate')
    )
  })
})
