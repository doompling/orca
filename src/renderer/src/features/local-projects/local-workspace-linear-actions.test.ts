import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { localLinearCatalog, localLinearLink } from './workspace-linear-picker-test-fixtures'

function setup() {
  const catalog = localLinearCatalog([localLinearLink()])
  const attachLinearIssue = vi.fn().mockResolvedValue(catalog.workspaces[0])
  const detachLinearIssue = vi.fn().mockResolvedValue(catalog.workspaces[0])
  const getSnapshot = vi.fn().mockResolvedValue(catalog)
  vi.stubGlobal('window', {
    api: { localProjects: { attachLinearIssue, detachLinearIssue, getSnapshot } }
  })
  const store = createTestStore()
  const fetchFolders = vi.fn()
  store.setState({
    localProjects: localLinearCatalog(),
    fetchFolderWorkspacesForAllHosts: fetchFolders
  })
  return { store, attachLinearIssue, detachLinearIssue, getSnapshot, fetchFolders }
}
afterEach(() => vi.unstubAllGlobals())

describe('Workspace Linear metadata actions', () => {
  it('attaches exact local IDs and refreshes only the metadata catalog', async () => {
    const { store, attachLinearIssue, fetchFolders } = setup()
    const args = { workspaceId: 'workspace', linearWorkspaceId: 'account', issueId: 'issue' }
    await store.getState().attachLocalWorkspaceLinearIssue(args)
    expect(attachLinearIssue).toHaveBeenCalledExactlyOnceWith(args)
    expect(store.getState().localProjects.workspaces[0].linearIssues).toEqual([localLinearLink()])
    expect(fetchFolders).not.toHaveBeenCalled()
    expect(store.getState().activeWorktreeId).toBeNull()
  })

  it('detaches only the exact organization/issue without any Linear network API', async () => {
    const { store, detachLinearIssue, fetchFolders } = setup()
    const args = { workspaceId: 'workspace', organizationId: 'org', issueId: 'issue' }
    await store.getState().detachLocalWorkspaceLinearIssue(args)
    expect(detachLinearIssue).toHaveBeenCalledExactlyOnceWith(args)
    expect(fetchFolders).not.toHaveBeenCalled()
  })

  it('keeps attachment failure visible and does not replace existing links', async () => {
    const { store, attachLinearIssue, getSnapshot } = setup()
    attachLinearIssue.mockRejectedValue(new Error('Account changed'))
    await expect(
      store.getState().attachLocalWorkspaceLinearIssue({
        workspaceId: 'workspace',
        linearWorkspaceId: 'account',
        issueId: 'issue'
      })
    ).rejects.toThrow('Account changed')
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(store.getState().localProjects.workspaces[0].linearIssues).toEqual([])
  })

  it('does not refresh a newly selected profile when an old link operation finishes', async () => {
    const { store, attachLinearIssue, getSnapshot } = setup()
    attachLinearIssue.mockImplementation(async () => {
      store.setState({ activeOrcaProfileId: 'other' })
    })
    await store.getState().attachLocalWorkspaceLinearIssue({
      workspaceId: 'workspace',
      linearWorkspaceId: 'account',
      issueId: 'issue'
    })
    expect(getSnapshot).not.toHaveBeenCalled()
  })

  it('refuses new link mutations while the profile is switching', async () => {
    const { store, attachLinearIssue, detachLinearIssue } = setup()
    store.setState({ orcaProfileSwitching: true })
    await expect(
      store.getState().attachLocalWorkspaceLinearIssue({
        workspaceId: 'workspace',
        linearWorkspaceId: 'account',
        issueId: 'issue'
      })
    ).rejects.toThrow('profile switch')
    await expect(
      store.getState().detachLocalWorkspaceLinearIssue({
        workspaceId: 'workspace',
        organizationId: 'org',
        issueId: 'issue'
      })
    ).rejects.toThrow('profile switch')
    expect(attachLinearIssue).not.toHaveBeenCalled()
    expect(detachLinearIssue).not.toHaveBeenCalled()
  })

  it('does not publish an old catalog if the profile changes during refresh', async () => {
    const { store, getSnapshot } = setup()
    getSnapshot.mockImplementation(async () => {
      store.setState({ activeOrcaProfileId: 'other' })
      return localLinearCatalog([localLinearLink()])
    })
    await store.getState().attachLocalWorkspaceLinearIssue({
      workspaceId: 'workspace',
      linearWorkspaceId: 'account',
      issueId: 'issue'
    })
    expect(store.getState().localProjects.workspaces[0].linearIssues).toEqual([])
  })
})
