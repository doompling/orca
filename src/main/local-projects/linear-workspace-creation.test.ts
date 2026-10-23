import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence/loading-store/store'
import {
  openLocalProjectsTestStore,
  refuseNextDurableWrite
} from './local-projects-store.test-support'
import type { LocalWorkspaceLinearIssue } from '../../shared/local-projects/linear-issues'

const { verifyIssue } = vi.hoisted(() => ({ verifyIssue: vi.fn() }))
vi.mock('./linear-issue-linking', () => ({ readLocalWorkspaceLinearIssue: verifyIssue }))
vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'ether-test',
    getVersion: () => '0.0.0',
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
  verifyIssue.mockReset()
})

const link: LocalWorkspaceLinearIssue = {
  linearWorkspaceId: 'account',
  organizationId: 'org',
  issueId: 'uuid',
  identifier: 'ENG-1',
  title: 'Verified issue',
  url: 'https://linear.app/team/issue/ENG-1',
  state: { name: 'Todo', type: 'unstarted', color: '' },
  linkedAt: 1,
  refreshedAt: 1,
  sourceContextId: 'local'
}

async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ether-linear-create-')))
  directories.push(directory)
  const root = join(directory, 'source')
  mkdirSync(root)
  const profileDir = directory
  const store = openLocalProjectsTestStore(profileDir)
  stores.push(store)
  const { project } = await store.createLocalProject({ name: 'App', roots: [{ path: root }] })
  const args = {
    projectId: project.id,
    name: 'ENG-1 Work',
    linearIssue: { linearWorkspaceId: 'account', issueId: 'uuid' }
  }
  verifyIssue.mockResolvedValue(link)
  return { store, args, profileDir }
}

describe('atomic verified Linear Workspace creation', () => {
  it('commits the Workspace and verified link together, preserving Main and restart state', async () => {
    const { store, args, profileDir } = await fixture()
    const before = store.getLocalProjectsSnapshot()
    const durable = vi.spyOn(store, 'whenLocalProjectsDurable')
    const workspace = await store.createLocalWorkspace(args)
    expect(verifyIssue).toHaveBeenCalledExactlyOnceWith(args.linearIssue)
    expect(durable).toHaveBeenCalledOnce()
    expect(workspace.name).toBe(args.name)
    expect(workspace.linearIssues).toEqual([link])
    expect(store.getLocalProjectsSnapshot().workspaces[0]).toEqual(before.workspaces[0])
    await store.whenLocalProjectsDurable()
    store.freezeWrites()
    const reopened = openLocalProjectsTestStore(profileDir)
    stores.push(reopened)
    expect(reopened.getLocalProjectsSnapshot().workspaces).toEqual([
      ...before.workspaces,
      workspace
    ])
  })

  it('leaves no Workspace after a verification failure, so retry creates only one', async () => {
    const { store, args } = await fixture()
    const before = store.getLocalProjectsSnapshot()
    verifyIssue.mockRejectedValueOnce(new Error('Linear unavailable'))
    await expect(store.createLocalWorkspace(args)).rejects.toThrow('Linear unavailable')
    expect(store.getLocalProjectsSnapshot()).toEqual(before)
    await store.createLocalWorkspace(args)
    expect(store.getLocalProjectsSnapshot().workspaces).toHaveLength(2)
  })

  it('refuses a Project archived during verification without saving the Workspace', async () => {
    const { store, args } = await fixture()
    verifyIssue.mockImplementationOnce(async () => {
      store.updateLocalProject({ projectId: args.projectId, updates: { isArchived: true } })
      return link
    })
    await expect(store.createLocalWorkspace(args)).rejects.toThrow('active local Project')
    expect(store.getLocalProjectsSnapshot().workspaces).toHaveLength(1)
  })

  it('reports a refused write and never verifies ordinary creation', async () => {
    const { store, args } = await fixture()
    refuseNextDurableWrite(store)
    await expect(store.createLocalWorkspace(args)).rejects.toThrow('Disk full')
    verifyIssue.mockClear()
    await store.createLocalWorkspace({ projectId: args.projectId, name: 'Plain' })
    expect(verifyIssue).not.toHaveBeenCalled()
  })
})
