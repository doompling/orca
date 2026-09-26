import { describe, expect, it, vi } from 'vitest'
import type { LinearIssue } from '../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../shared/local-projects/types'
import type { LocalWorkspaceLinearIssue } from '../../shared/local-projects/linear-issues'
import { linkLocalWorkspaceLinearIssue } from './linear-issue-linking'
import { attachLocalWorkspaceLinearIssue } from './linear-issue-persistence'

vi.mock('../linear/linear-issue-lookups', () => ({ getIssue: vi.fn() }))
vi.mock('../linear/linear-workspace-registry', () => ({ getWorkspaceState: vi.fn() }))

function fixture() {
  let catalog: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Project',
        roots: [{ id: 'root', label: 'Root', path: '/source' }],
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
        updatedAt: 1
      }
    ]
  }
  const account: LinearWorkspace = {
    id: 'account',
    organizationId: 'org',
    organizationName: 'Organization',
    displayName: 'Test',
    email: null,
    credentialRevision: 1
  }
  const issue: LinearIssue = {
    id: 'issue',
    workspaceId: account.id,
    identifier: 'ENG-1',
    title: 'Build something',
    url: 'https://linear.app/test/issue/ENG-1',
    state: { name: 'Todo', type: 'unstarted', color: '' },
    team: { id: 'team', key: 'ENG', name: 'Engineering' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: new Date(0).toISOString()
  }
  const owner = {
    getLocalProjectsSnapshot: () => structuredClone(catalog),
    attachLocalWorkspaceLinearIssue: vi.fn(
      (workspaceId: string, value: LocalWorkspaceLinearIssue) =>
        attachLocalWorkspaceLinearIssue(owner, workspaceId, value, (next) => {
          catalog = next
        })
    )
  }
  const reader = {
    getWorkspaces: vi.fn(() => [account]),
    getIssue: vi.fn<(issueId: string, accountId: string) => Promise<LinearIssue | null>>(
      async () => issue
    )
  }
  return {
    owner,
    reader,
    issue,
    account,
    args: { workspaceId: 'workspace', linearWorkspaceId: account.id, issueId: issue.id },
    archive: () => {
      catalog.workspaces[0].isArchived = true
    }
  }
}

describe('verified local Workspace Linear linking', () => {
  it('uses the exact account and persists only a provider-verified local snapshot', async () => {
    const { owner, reader, args, issue } = fixture()
    const workspace = await linkLocalWorkspaceLinearIssue(owner, args, reader)
    expect(reader.getIssue).toHaveBeenCalledExactlyOnceWith('issue', 'account')
    expect(workspace.linearIssues).toEqual([
      {
        linearWorkspaceId: 'account',
        organizationId: 'org',
        issueId: 'issue',
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        state: issue.state,
        linkedAt: expect.any(Number),
        refreshedAt: expect.any(Number),
        sourceContextId: 'local'
      }
    ])
  })

  it('refuses unknown, all, and organization-less legacy accounts before any read', async () => {
    const { owner, reader, args, account } = fixture()
    for (const linearWorkspaceId of ['unknown', 'all']) {
      await expect(
        linkLocalWorkspaceLinearIssue(owner, { ...args, linearWorkspaceId }, reader)
      ).rejects.toThrow()
    }
    reader.getWorkspaces.mockReturnValue([{ ...account, organizationId: 'legacy' }])
    await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow('Connect')
    expect(reader.getIssue).not.toHaveBeenCalled()
    expect(owner.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('retains the catalog when an issue cannot be verified or the request fails', async () => {
    const { owner, reader, args } = fixture()
    reader.getIssue.mockResolvedValueOnce(null)
    await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow(
      'Could not verify'
    )
    reader.getIssue.mockRejectedValueOnce(new Error('network unavailable'))
    await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow(
      'network unavailable'
    )
    expect(owner.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('does not accept another issue or account, including an unscoped result', async () => {
    const { owner, reader, args, issue } = fixture()
    for (const wrong of [
      { ...issue, id: 'other' },
      { ...issue, workspaceId: 'other' },
      { ...issue, workspaceId: undefined }
    ]) {
      reader.getIssue.mockResolvedValueOnce(wrong)
      await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow(
        'did not match'
      )
    }
    expect(owner.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
  })

  it('rejects credentials changed or disconnected during the read', async () => {
    for (const change of ['disconnect', 'organization', 'revision']) {
      const { owner, reader, args, issue, account } = fixture()
      reader.getIssue.mockImplementationOnce(async () => {
        reader.getWorkspaces.mockReturnValue(
          change === 'disconnect'
            ? []
            : [
                {
                  ...account,
                  ...(change === 'organization'
                    ? { organizationId: 'other' }
                    : { credentialRevision: 2 })
                }
              ]
        )
        return issue
      })
      await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow(
        'account changed'
      )
      expect(owner.attachLocalWorkspaceLinearIssue).not.toHaveBeenCalled()
    }
  })

  it('rechecks active Workspace ownership after the read', async () => {
    const { owner, reader, args, issue, archive } = fixture()
    reader.getIssue.mockImplementationOnce(async () => {
      archive()
      return issue
    })
    await expect(linkLocalWorkspaceLinearIssue(owner, args, reader)).rejects.toThrow(
      'active local Workspace'
    )
    expect(owner.getLocalProjectsSnapshot().workspaces[0].linearIssues).toBeUndefined()
  })

  it('merges concurrent attachments into the latest catalog', async () => {
    const { owner, reader, args, issue } = fixture()
    reader.getIssue.mockImplementation(async (id) => ({ ...issue, id }))
    await Promise.all([
      linkLocalWorkspaceLinearIssue(owner, args, reader),
      linkLocalWorkspaceLinearIssue(owner, { ...args, issueId: 'second' }, reader)
    ])
    expect(
      owner.getLocalProjectsSnapshot().workspaces[0].linearIssues?.map((entry) => entry.issueId)
    ).toEqual(['issue', 'second'])
  })
})
