import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { onTestFinished, vi } from 'vitest'
import { openWritableProfileStateDatabase } from '../persistence/profile-state/profile-state-database'
import { Store } from '../persistence/loading-store/store'
import { readProfileStateDomain } from '../persistence/profile-state/profile-state-domain-reader'
import { ProfileStateSqliteAuthority } from '../persistence/profile-state/profile-state-sqlite-authority'

const PROFILE_ID = 'local-projects-test'

/** A writable SQLite-backed profile Store in `profileDir`; call again to reopen it. */
export function openLocalProjectsTestStore(profileDir: string): Store {
  const databasePath = join(profileDir, 'profile-state.db')
  if (existsSync(databasePath)) {
    // Why: a frozen store closed the WAL database; the test runtime's SQLite cannot open it
    // read-only until a writer has recreated its shared-memory file.
    const keeper = openWritableProfileStateDatabase(databasePath, PROFILE_ID)
    onTestFinished(() => keeper.db.close())
  }
  const authority = new ProfileStateSqliteAuthority(databasePath, PROFILE_ID)
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  return new Store({
    dataFile: join(profileDir, 'orca-data.json'),
    profileStateAuthority: authority
  })
}

/** One committed top-level profile domain, read straight from the database. */
export function readSavedProfileDomain(profileDir: string, domain: string): unknown {
  const result = readProfileStateDomain(join(profileDir, 'profile-state.db'), PROFILE_ID, domain)
  if (result.kind === 'unreadable') {
    throw result.error
  }
  return result.kind === 'value' ? result.value : undefined
}

/** The next local Projects durability barrier reports a refused profile write, as a full disk would. */
export function refuseNextDurableWrite(store: Store, message = 'Disk full'): void {
  vi.spyOn(store, 'whenLocalProjectsDurable').mockRejectedValueOnce(new Error(message))
}
