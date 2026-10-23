import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../shared/local-projects/types'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { bootstrapProfileStateAuthority } from '../persistence/profile-state/profile-state-authority-bootstrap'
import { profileStateDatabaseFile } from '../persistence/profile-state/profile-state-database'
import type { ProfileStateSqliteAuthority } from '../persistence/profile-state/profile-state-sqlite-authority'
// Importing the SQLite module routes this file to the Node runtime project, as in the app.
import '../sqlite/sync-database'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../ssh/config/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))

const { Store } = await import('../persistence/loading-store/store')

const directories: string[] = []
const authorities: ProfileStateSqliteAuthority[] = []
const stores: InstanceType<typeof Store>[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) {
    await store.freezeWritesAsync()
  }
  for (const authority of authorities.splice(0)) {
    authority.close()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function legacyProfile() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ether-profile-migration-')))
  directories.push(root)
  const profileDir = join(root, 'profiles', 'local-default')
  const appA = join(root, 'app-a')
  const appB = join(root, 'app-b')
  const alternateB = join(root, 'app-b-feature')
  for (const directory of [profileDir, appA, appB, alternateB]) {
    mkdirSync(directory, { recursive: true })
  }
  const localProjects: LocalProjectsState = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Application',
        roots: [
          { id: 'a', label: 'App A', path: appA },
          { id: 'b', label: 'App B', path: appB }
        ],
        defaultRootId: 'b',
        lastWorkspaceId: 'feature',
        isArchived: false,
        createdAt: 1,
        updatedAt: 2
      }
    ],
    workspaces: [
      {
        id: 'main',
        projectId: 'project',
        name: 'Main',
        checkoutOverridesByRootId: {},
        isArchived: false,
        markSlot: 1,
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'feature',
        projectId: 'project',
        name: 'Feature',
        checkoutOverridesByRootId: { b: alternateB },
        isArchived: false,
        lastActivityAt: 5,
        linearIssues: [
          {
            linearWorkspaceId: 'linear-workspace',
            organizationId: 'organization',
            issueId: 'issue',
            identifier: 'APP-1',
            title: 'Migrate safely',
            url: 'https://linear.app/acme/issue/APP-1/migrate-safely',
            state: { name: 'Todo', type: 'unstarted', color: '#999999' },
            linkedAt: 3,
            refreshedAt: 4,
            sourceContextId: 'local'
          }
        ],
        createdAt: 2,
        updatedAt: 5
      },
      {
        id: 'old',
        projectId: 'project',
        name: 'Old',
        checkoutOverridesByRootId: {},
        isArchived: true,
        createdAt: 1,
        updatedAt: 6
      }
    ]
  }
  const dataFile = join(profileDir, 'orca-data.json')
  writeFileSync(dataFile, JSON.stringify({ localProjects }))
  return { profileDir, dataFile, localProjects, appA, alternateB }
}

function open(profileDir: string, dataFile: string) {
  const result = bootstrapProfileStateAuthority({
    dataFile,
    databaseFile: profileStateDatabaseFile(profileDir),
    profileId: 'local-default'
  })
  if (!result.authority) {
    throw new Error(`No SQLite authority for a ${result.classification} profile`)
  }
  authorities.push(result.authority)
  const store = new Store({ dataFile, profileStateAuthority: result.authority })
  stores.push(store)
  return { store, migrated: result.migrated }
}

describe('local Projects across the one-way SQLite profile import', () => {
  it('imports every Project, Workspace, mark, checkout, archive and Linear link from legacy JSON', () => {
    const { profileDir, dataFile, localProjects, appA, alternateB } = legacyProfile()
    const legacyBytes = readFileSync(dataFile, 'utf8')
    const { store, migrated } = open(profileDir, dataFile)

    expect(migrated).toBe(true)
    expect(store.getLocalProjectsSnapshot()).toEqual(localProjects)
    expect(store.resolveLocalWorkspace('feature')).toMatchObject({
      defaultRootId: 'b',
      roots: [
        { id: 'a', path: appA },
        { id: 'b', path: alternateB }
      ]
    })
    expect(store.getFolderWorkspace('feature')?.folderPath).toBe(alternateB)
    expect(
      store.getLocalProjectsSnapshot().workspaces.find(({ id }) => id === 'old')
    ).toMatchObject({
      isArchived: true
    })
    // The import leaves the legacy file for rollback.
    expect(readFileSync(dataFile, 'utf8')).toBe(legacyBytes)
  })

  it('keeps edits made after the import across a restart without importing again', async () => {
    const { profileDir, dataFile } = legacyProfile()
    const first = open(profileDir, dataFile).store
    first.updateLocalWorkspace({ workspaceId: 'feature', updates: { markSlot: 1 } })
    const key = folderWorkspaceKey('feature')
    first.setWorkspaceSession({
      ...first.getWorkspaceSession(),
      activeWorkspaceKey: key,
      activeWorktreeId: key
    })
    first.flushOrThrow()
    await first.freezeWritesAsync()

    const { store: reopened, migrated } = open(profileDir, dataFile)
    expect(migrated).toBe(false)
    const workspaces = reopened.getLocalProjectsSnapshot().workspaces
    expect(workspaces.find((workspace) => workspace.id === 'feature')?.markSlot).toBe(1)
    expect(workspaces.find((workspace) => workspace.id === 'main')?.markSlot).toBeUndefined()
    expect(reopened.getWorkspaceSession().activeWorktreeId).toBe(key)
  })
})
