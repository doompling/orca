import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence/loading-store/store'
import { openLocalProjectsTestStore } from './local-projects-store.test-support'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import {
  LocalWorkspaceLinearIssuesSchema,
  type LocalWorkspaceLinearIssue
} from '../../shared/local-projects/linear-issues'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'ether-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const stores: Store[] = []
const directories: string[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

const issue: LocalWorkspaceLinearIssue = {
  linearWorkspaceId: 'account',
  organizationId: 'org',
  issueId: 'issue',
  identifier: 'ENG-1',
  title: 'Work across applications',
  url: 'https://linear.app/test/issue/ENG-1',
  state: { name: 'Todo', type: 'unstarted', color: '' },
  linkedAt: 1,
  refreshedAt: 1,
  sourceContextId: 'local'
}

async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ether-linear-link-')))
  directories.push(directory)
  const root = join(directory, 'source')
  mkdirSync(root)
  const profileDir = directory
  const store = openLocalProjectsTestStore(profileDir)
  stores.push(store)
  const { project, workspace } = await store.createLocalProject({
    name: 'Project',
    roots: [{ path: root }]
  })
  return { store, profileDir, root, project, workspace }
}

describe('Workspace Linear link persistence', () => {
  it('supports many issues per Workspace and the same issue in independent Workspaces', async () => {
    const { store, project, workspace, root } = await fixture()
    const other = await store.createLocalWorkspace({ projectId: project.id, name: 'Other' })
    const otherProject = await store.createLocalProject({
      name: 'Other Project',
      roots: [{ path: root }]
    })
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    store.attachLocalWorkspaceLinearIssue(workspace.id, { ...issue, issueId: 'second' })
    store.attachLocalWorkspaceLinearIssue(other.id, issue)
    store.attachLocalWorkspaceLinearIssue(otherProject.workspace.id, issue)
    expect(
      store.getLocalProjectsSnapshot().workspaces.map((entry) => entry.linearIssues?.length)
    ).toEqual([2, 1, 1])
    expect(store.getFolderWorkspace(workspace.id)?.linkedTask).toBeNull()
    const fresh = await store.createLocalWorkspace({ projectId: project.id, name: 'Fresh' })
    expect(fresh.linearIssues).toBeUndefined()
  })

  it('refreshes a duplicate without changing its original link date or conflating organizations', async () => {
    const { store, workspace } = await fixture()
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    store.attachLocalWorkspaceLinearIssue(workspace.id, { ...issue, organizationId: 'other-org' })
    const updated = store.attachLocalWorkspaceLinearIssue(workspace.id, {
      ...issue,
      title: 'Updated',
      linkedAt: 10,
      refreshedAt: 10
    })
    expect(updated.linearIssues).toHaveLength(2)
    expect(updated.linearIssues?.[0]).toMatchObject({
      title: 'Updated',
      linkedAt: 1,
      refreshedAt: 10
    })
    expect(updated.linearIssues?.[1].title).toBe(issue.title)
  })

  it('detaches only the exact Workspace and organization; an absent link is a no-op', async () => {
    const { store, project, workspace } = await fixture()
    const other = await store.createLocalWorkspace({ projectId: project.id, name: 'Other' })
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    store.attachLocalWorkspaceLinearIssue(workspace.id, { ...issue, organizationId: 'other-org' })
    store.attachLocalWorkspaceLinearIssue(other.id, issue)
    const args = {
      workspaceId: workspace.id,
      organizationId: issue.organizationId,
      issueId: issue.issueId
    }
    const remaining = store.detachLocalWorkspaceLinearIssue(args)
    expect(remaining.linearIssues?.map((entry) => entry.organizationId)).toEqual(['other-org'])
    expect(store.getLocalProjectsSnapshot().workspaces[1].linearIssues).toEqual([issue])
    const flush = vi.spyOn(store, 'flushOrThrow')
    expect(store.detachLocalWorkspaceLinearIssue(args)).toEqual(remaining)
    expect(flush).not.toHaveBeenCalled()
  })

  it('persists links across restart without changing saved tabs or drafts', async () => {
    const { store, workspace, root, profileDir } = await fixture()
    const key = folderWorkspaceKey(workspace.id)
    const session = {
      ...store.getWorkspaceSession(),
      activeWorkspaceKey: key,
      activeWorktreeId: key,
      openFilesByWorktree: {
        [key]: [
          {
            filePath: join(root, 'note.txt'),
            relativePath: 'note.txt',
            worktreeId: key,
            language: 'plaintext',
            dirtyDraftContent: 'Keep this draft'
          }
        ]
      }
    }
    store.setWorkspaceSession(session)
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    expect(store.getWorkspaceSession()).toEqual(session)
    store.flushOrThrow()
    store.freezeWrites()
    const reopened = openLocalProjectsTestStore(profileDir)
    stores.push(reopened)
    expect(reopened.getLocalProjectsSnapshot().workspaces[0].linearIssues).toEqual([issue])
    expect(reopened.getWorkspaceSession()).toEqual(session)
  })

  it('retains archived links, refuses new ones there, and permits explicit detach', async () => {
    const { store, workspace, project } = await fixture()
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    store.updateLocalProject({ projectId: project.id, updates: { isArchived: true } })
    expect(store.getLocalProjectsSnapshot().workspaces[0].linearIssues).toEqual([issue])
    expect(() =>
      store.attachLocalWorkspaceLinearIssue(workspace.id, { ...issue, issueId: 'second' })
    ).toThrow('active local Workspace')
    expect(
      store.detachLocalWorkspaceLinearIssue({
        workspaceId: workspace.id,
        organizationId: 'org',
        issueId: 'issue'
      }).linearIssues
    ).toEqual([])
  })

  it('rolls back failed writes and refuses closing-profile writes', async () => {
    const { store, workspace } = await fixture()
    store.attachLocalWorkspaceLinearIssue(workspace.id, issue)
    const before = store.getLocalProjectsSnapshot()
    vi.spyOn(store, 'flushOrThrow').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    expect(() =>
      store.detachLocalWorkspaceLinearIssue({
        workspaceId: workspace.id,
        organizationId: 'org',
        issueId: 'issue'
      })
    ).toThrow('disk full')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
    store.freezeWrites()
    expect(() =>
      store.attachLocalWorkspaceLinearIssue(workspace.id, { ...issue, title: 'Late' })
    ).toThrow('closing')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
  })

  it('bounds and validates snapshots without introducing credentials or remote references', () => {
    expect(LocalWorkspaceLinearIssuesSchema.safeParse([issue, issue]).success).toBe(false)
    expect(
      LocalWorkspaceLinearIssuesSchema.safeParse([{ ...issue, sourceContextId: 'ssh:host' }])
        .success
    ).toBe(false)
    expect(
      LocalWorkspaceLinearIssuesSchema.safeParse([{ ...issue, apiKey: 'not allowed' }]).success
    ).toBe(false)
    expect(
      LocalWorkspaceLinearIssuesSchema.safeParse([
        { ...issue, url: 'https://example.test/issue/ENG-1' }
      ]).success
    ).toBe(false)
    expect(
      LocalWorkspaceLinearIssuesSchema.safeParse(
        Array.from({ length: 101 }, (_, index) => ({ ...issue, issueId: String(index) }))
      ).success
    ).toBe(false)
  })
})
