import { describe, expect, it, vi } from 'vitest'
import {
  localLinearIssueAccount,
  localLinearIssueAttachments,
  localLinearWorkspaceTargets
} from './local-workspace-linear-attachments'
import {
  localWorkspaceLinearTaskRefs,
  readLinkedLinearIssueRef
} from './local-workspace-linear-task-refs'
import { linkedLinearIssueRefsSignature } from '@/components/task-page/linear/task-page-linear-in-orca-issues'
import {
  localLinearAccount,
  localLinearCatalog,
  localLinearIssue,
  localLinearSource,
  localLinearLink
} from './local-workspace-linear-test-fixtures'

describe('canonical local Linear Tasks attachments', () => {
  it('returns every exact issue/org attachment without picking the latest Workspace', () => {
    const catalog = localLinearCatalog()
    catalog.workspaces[0].lastActivityAt = 999
    catalog.workspaces[1].lastActivityAt = 1
    catalog.workspaces[2].linearIssues = [{ ...localLinearLink, organizationId: 'other' }]
    const targets = localLinearWorkspaceTargets(catalog)
    expect(
      localLinearIssueAttachments(targets, 'organization', 'issue').map((target) => target.label)
    ).toEqual(['Application / Main', 'Application / Investigate'])
    expect(localLinearIssueAttachments(targets, 'organization', 'different-uuid')).toEqual([])
  })

  it('requires the issue account on the local host, never an active-account or identifier guess', () => {
    expect(localLinearIssueAccount(localLinearIssue, 'local', [localLinearAccount])).toEqual(
      localLinearAccount
    )
    expect(
      localLinearIssueAccount(localLinearIssue, 'runtime:remote', [localLinearAccount])
    ).toBeNull()
    expect(
      localLinearIssueAccount({ workspaceId: 'all' }, 'local', [localLinearAccount])
    ).toBeNull()
    expect(localLinearIssueAccount({}, 'local', [localLinearAccount])).toBeNull()
    expect(
      localLinearIssueAccount(localLinearIssue, 'local', [{ ...localLinearAccount, id: 'other' }])
    ).toBeNull()
  })

  it('excludes archived Projects and Workspaces without removing saved links', () => {
    const catalog = localLinearCatalog()
    catalog.workspaces[0].isArchived = true
    expect(localLinearWorkspaceTargets(catalog).map(({ workspace }) => workspace.id)).toEqual([
      'investigate',
      'unlinked'
    ])
    catalog.projects[0].isArchived = true
    expect(localLinearWorkspaceTargets(catalog)).toEqual([])
    expect(catalog.workspaces[0].linearIssues).toHaveLength(1)
  })

  it('collects one UUID read for multiple attachments, with the saved account and explicit local context', () => {
    const refs = localWorkspaceLinearTaskRefs({
      catalog: localLinearCatalog(),
      accounts: [localLinearAccount],
      sourceContext: localLinearSource
    })
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({
      issueId: 'issue',
      organizationId: 'organization',
      workspaceId: 'account',
      sourceContext: { hostId: 'local', providerIdentity: { workspaceId: 'account' } }
    })
    const changed = [{ ...refs[0], issueId: 'another-uuid' }]
    expect(linkedLinearIssueRefsSignature(refs)).not.toBe(linkedLinearIssueRefsSignature(changed))
  })

  it('does not route a saved link through another account, organization, host or archived Workspace', () => {
    const args = {
      catalog: localLinearCatalog(),
      accounts: [localLinearAccount],
      sourceContext: localLinearSource
    }
    expect(localWorkspaceLinearTaskRefs({ ...args, accounts: [] })).toEqual([])
    expect(
      localWorkspaceLinearTaskRefs({
        ...args,
        accounts: [{ ...localLinearAccount, organizationId: 'other' }]
      })
    ).toEqual([])
    expect(localWorkspaceLinearTaskRefs({ ...args, selectedAccountId: 'another-account' })).toEqual(
      []
    )
    expect(
      localWorkspaceLinearTaskRefs({
        ...args,
        sourceContext: { ...localLinearSource, hostId: 'runtime:remote' }
      })
    ).toEqual([])
    args.catalog.projects[0].isArchived = true
    expect(localWorkspaceLinearTaskRefs(args)).toEqual([])
  })

  it('reads a renamed ticket by UUID and rejects a wrong-account or wrong-UUID response', async () => {
    const [ref] = localWorkspaceLinearTaskRefs({
      catalog: localLinearCatalog(),
      accounts: [localLinearAccount],
      sourceContext: localLinearSource
    })
    const fetch = vi.fn().mockResolvedValue({ ...localLinearIssue, identifier: 'NEW-42' })
    const refresh = vi.fn().mockResolvedValue(localLinearIssue)
    const options = { fetch, refresh, forceRefresh: false, sourceContext: localLinearSource }
    expect(await readLinkedLinearIssueRef(ref, options)).toMatchObject({ identifier: 'NEW-42' })
    expect(fetch).toHaveBeenCalledWith('issue', 'account', { sourceContext: ref.sourceContext })
    fetch.mockResolvedValueOnce({ ...localLinearIssue, workspaceId: 'wrong-account' })
    expect(await readLinkedLinearIssueRef(ref, options)).toBeNull()
    fetch.mockResolvedValueOnce({ ...localLinearIssue, id: 'wrong-uuid' })
    expect(await readLinkedLinearIssueRef(ref, options)).toBeNull()
    await readLinkedLinearIssueRef(ref, { ...options, forceRefresh: true })
    expect(refresh).toHaveBeenCalledOnce()
  })
})
