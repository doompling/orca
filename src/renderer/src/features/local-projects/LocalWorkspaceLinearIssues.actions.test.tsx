// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import type { AttachLocalWorkspaceLinearIssueArgs } from '../../../../shared/local-projects/linear-issues'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import { LocalWorkspaceLinearIssuesContent } from './LocalWorkspaceLinearIssues'
import {
  localLinearCatalog,
  localLinearIssue,
  localLinearLink,
  localLinearStatus
} from './workspace-linear-picker-test-fixtures'

const actions = vi.hoisted(() => ({
  attachLocalWorkspaceLinearIssue:
    vi.fn<(args: AttachLocalWorkspaceLinearIssueArgs) => Promise<void>>(),
  detachLocalWorkspaceLinearIssue: vi.fn(async () => {}),
  openTaskPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn()
}))
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
let profileId = 'profile'
function state() {
  return {
    ...actions,
    localProjects: catalog,
    activeOrcaProfileId: profileId,
    orcaProfileSwitching: false
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  catalog = localLinearCatalog([localLinearLink()])
  profileId = 'profile'
  actions.attachLocalWorkspaceLinearIssue.mockResolvedValue(undefined)
  vi.mocked(linearStatus).mockResolvedValue(localLinearStatus())
  vi.mocked(linearListIssues).mockResolvedValue({ items: [localLinearIssue()] })
  vi.mocked(linearSearchIssues).mockResolvedValue([localLinearIssue()])
  vi.mocked(linearGetIssue).mockResolvedValue(localLinearIssue())
})
afterEach(cleanup)

describe('Workspace linked issue workflows', () => {
  it('opens existing in-app details using local account identity and the saved UUID', async () => {
    const onClose = vi.fn()
    render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open APP-1 in Ether' }))
    await waitFor(() =>
      expect(actions.openTaskPage).toHaveBeenCalledExactlyOnceWith({
        taskSource: 'linear',
        openLinearIssue: localLinearIssue(),
        openLinearSourceContext: {
          kind: 'task-source',
          provider: 'linear',
          hostId: 'local',
          projectId: 'project',
          providerIdentity: { provider: 'linear', workspaceId: 'account' }
        }
      })
    )
    expect(onClose).toHaveBeenCalledOnce()
    expect(actions.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('refreshes only the saved issue details through the existing verified upsert', async () => {
    render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh APP-1 details' }))
    await waitFor(() =>
      expect(actions.attachLocalWorkspaceLinearIssue).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'workspace',
        linearWorkspaceId: 'account',
        issueId: 'issue'
      })
    )
    expect(actions.detachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
    expect(actions.openTaskPage).not.toHaveBeenCalled()
  })

  it('retains saved details and shows a failed refresh', async () => {
    actions.attachLocalWorkspaceLinearIssue.mockRejectedValueOnce(new Error('Issue unavailable'))
    render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh APP-1 details' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Issue unavailable')
    expect(screen.getByText('APP-1 · Fix the application')).toBeTruthy()
    expect(catalog.workspaces[0].linearIssues).toEqual([localLinearLink()])
  })

  it('links multiple searched issues without closing, removing prior links, or starting work', async () => {
    catalog = localLinearCatalog()
    const second = { ...localLinearIssue('second'), identifier: 'APP-2', title: 'Second task' }
    vi.mocked(linearSearchIssues).mockResolvedValue([localLinearIssue(), second])
    actions.attachLocalWorkspaceLinearIssue.mockImplementation(async ({ issueId }) => {
      const issue = issueId === 'second' ? second : localLinearIssue()
      catalog.workspaces[0].linearIssues?.push({
        ...localLinearLink(),
        issueId,
        identifier: issue.identifier,
        title: issue.title
      })
    })
    const onClose = vi.fn()
    render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={onClose} />)
    fireEvent.change(await screen.findByPlaceholderText('Search Linear issues…'), {
      target: { value: 'application' }
    })
    fireEvent.click(await screen.findByRole('option', { name: /APP-1.*Fix the application/ }))
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: /APP-1.*Linked/ }).getAttribute('aria-disabled')
      ).toBe('true')
    )
    fireEvent.click(screen.getByRole('option', { name: /APP-2.*Second task/ }))
    await screen.findByText('APP-2 · Second task')
    expect(catalog.workspaces[0].linearIssues?.map((link) => link.issueId)).toEqual([
      'issue',
      'second'
    ])
    expect(actions.attachLocalWorkspaceLinearIssue).toHaveBeenCalledTimes(2)
    expect(actions.openTaskPage).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not navigate after the profile changes while a saved issue is loading', async () => {
    let finish: ((issue: LinearIssue) => void) | undefined
    vi.mocked(linearGetIssue).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<LocalWorkspaceLinearIssuesContent workspaceId="workspace" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open APP-1 in Ether' }))
    await waitFor(() => expect(linearGetIssue).toHaveBeenCalledOnce())
    profileId = 'another-profile'
    await act(async () => {
      finish?.(localLinearIssue())
    })
    expect(actions.openTaskPage).not.toHaveBeenCalled()
  })
})
