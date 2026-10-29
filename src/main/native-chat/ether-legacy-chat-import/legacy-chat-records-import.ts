// Copies the pre-merge Ether chat records file (`agent-sessions/agent-sessions.json`) into the host
// journal database once. The file and its `.bak` are only read; rows already present are kept.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextAgentSessionFence } from '../../../shared/agent-session-next-fence'
import type { PersistedAgentSessionRecord } from '../../../shared/agent-session-legacy-handoff-lease'
import { structuredAgentSessionTabId } from '../../../shared/structured-agent-session-projection'
import { isAgentSessionSurfaceTabId } from '../../../shared/agent-session-surface-tab-id'
import type Database from '../../sqlite/sync-database'
import {
  isReadableAgentSessionStoreOperation,
  isReadableAgentSessionStoreRecord,
  isReadableRetiredAgentSessionClaimKey
} from '../../runtime/agent-session-store-row-rules'

const RECORDS_IMPORT_MARKER = 'ether_legacy_records_import'
/** Same key agent-session-record-rows.ts writes once the tab index is recorded. */
const SESSION_TABS_RECORDED = 'session_tabs_recorded'

type LegacyStoreFile = {
  hostId?: unknown
  records: Record<string, unknown>
  operations?: unknown
  retiredClaimKeys?: unknown
  visibleSessionIds?: unknown
}

type LegacyStoreRead =
  | { kind: 'absent' }
  | { kind: 'unusable' }
  | { kind: 'loaded'; file: LegacyStoreFile; fromBackup: boolean }

export type LegacyChatRecordsImport = {
  imported: string[]
  skippedOpenCode: number
  skippedUnreadable: number
  fromBackup: boolean
  fileHostId: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Absent on ENOENT; throws any other read failure so a later launch retries. */
function readStoreFile(path: string): LegacyStoreRead {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if (isObject(error) && error.code === 'ENOENT') {
      return { kind: 'absent' }
    }
    throw error
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isObject(parsed) && isObject(parsed.records)) {
      return { kind: 'loaded', file: { ...parsed, records: parsed.records }, fromBackup: false }
    }
  } catch {
    // Unparseable: the backup is tried next.
  }
  return { kind: 'unusable' }
}

export function readLegacyChatRecordsFile(stateDirectory: string): LegacyStoreRead {
  const path = join(stateDirectory, 'agent-sessions', 'agent-sessions.json')
  const primary = readStoreFile(path)
  if (primary.kind === 'loaded') {
    return primary
  }
  const backup = readStoreFile(`${path}.bak`)
  if (backup.kind === 'loaded') {
    return { ...backup, fromBackup: true }
  }
  return primary.kind === 'absent' && backup.kind === 'absent'
    ? { kind: 'absent' }
    : { kind: 'unusable' }
}

/** Ether's removed OpenCode chat; this build has no runtime for it. */
export function isLegacyOpenCodeRecord(value: unknown): boolean {
  if (!isObject(value)) {
    return false
  }
  const home = value.accountHome
  return value.provider === 'opencode' || (isObject(home) && home.variable === 'XDG_DATA_HOME')
}

/** After a backup read the lost commit may have granted a fence the backup cannot show. */
function withBackupFenceFloor(record: PersistedAgentSessionRecord): PersistedAgentSessionRecord {
  const lease = { ...record.lease, runtimeKind: 'native' as const, handoffStage: null }
  const floor = Math.max(record.lease.minimumNextFence ?? 0, nextAgentSessionFence(lease) + 1)
  return { ...record, lease: { ...record.lease, minimumNextFence: floor } }
}

/** Tab ids in visible order: a recorded id, else the derived one, else a reopened suffix. */
function seedTabs(visible: unknown, imported: ReadonlyMap<string, unknown>): [string, string][] {
  if (!Array.isArray(visible)) {
    return []
  }
  const taken = new Set<string>()
  const rows: [string, string][] = []
  for (const sessionId of new Set(visible)) {
    const record = typeof sessionId === 'string' ? imported.get(sessionId) : undefined
    if (typeof sessionId !== 'string' || !isObject(record)) {
      continue
    }
    const derived = structuredAgentSessionTabId(sessionId)
    const candidates = [record.surfaceTabId, derived].filter(isAgentSessionSurfaceTabId)
    let tabId = candidates.find((candidate) => !taken.has(candidate))
    for (let suffix = 1; tabId === undefined; suffix++) {
      const reopened = `${derived}-reopened${suffix === 1 ? '' : `-${suffix}`}`
      tabId = taken.has(reopened) ? undefined : reopened
    }
    taken.add(tabId)
    rows.push([tabId, sessionId])
  }
  return rows
}

function writeTabs(db: Database.Database, rows: readonly [string, string][]): void {
  const recorded = db
    .prepare('SELECT 1 AS present FROM agent_session_store_meta WHERE key = ?')
    .get(SESSION_TABS_RECORDED)
  const hasTabs = db.prepare('SELECT 1 AS present FROM agent_session_tabs LIMIT 1').get()
  if (recorded || hasTabs) {
    return
  }
  const insert = db.prepare(
    'INSERT INTO agent_session_tabs (tab_id, session_id, position) VALUES (?, ?, ?)'
  )
  rows.forEach(([tabId, sessionId], position) => insert.run(tabId, sessionId, position))
  db.prepare('INSERT INTO agent_session_store_meta (key, value) VALUES (?, ?)').run(
    SESSION_TABS_RECORDED,
    '1'
  )
}

export function legacyChatRecordsImported(db: Database.Database): boolean {
  return (
    db
      .prepare('SELECT 1 AS present FROM agent_session_store_meta WHERE key = ?')
      .get(RECORDS_IMPORT_MARKER) !== undefined
  )
}

/** Inside the caller's transaction: every row this build can read, and the run marker. */
export function writeLegacyChatRecords(
  db: Database.Database,
  read: LegacyStoreRead
): LegacyChatRecordsImport {
  const summary: LegacyChatRecordsImport = {
    imported: [],
    skippedOpenCode: 0,
    skippedUnreadable: 0,
    fromBackup: read.kind === 'loaded' && read.fromBackup,
    fileHostId:
      read.kind === 'loaded' && typeof read.file.hostId === 'string' ? read.file.hostId : null
  }
  if (read.kind === 'loaded') {
    const { file, fromBackup } = read
    const imported = new Map<string, unknown>()
    const insertRecord = db.prepare(
      'INSERT INTO agent_session_records (session_id, record_json) VALUES (?, ?) ON CONFLICT(session_id) DO NOTHING'
    )
    for (const [sessionId, value] of Object.entries(file.records)) {
      if (isLegacyOpenCodeRecord(value)) {
        summary.skippedOpenCode++
        continue
      }
      // Unreadable rows are skipped rather than set aside: a set-aside row blocks root edits.
      if (!isReadableAgentSessionStoreRecord(sessionId, value)) {
        summary.skippedUnreadable++
        continue
      }
      const record = fromBackup ? withBackupFenceFloor(value) : value
      if (insertRecord.run(sessionId, JSON.stringify(record)).changes > 0) {
        imported.set(sessionId, record)
        summary.imported.push(sessionId)
      }
    }
    const insertOperation = db.prepare(
      'INSERT INTO agent_session_operations (operation_key, row_json) VALUES (?, ?) ON CONFLICT(operation_key) DO NOTHING'
    )
    for (const [key, row] of Object.entries(isObject(file.operations) ? file.operations : {})) {
      if (isReadableAgentSessionStoreOperation(key, row)) {
        insertOperation.run(key, JSON.stringify(row))
      }
    }
    const insertKey = db.prepare(
      'INSERT INTO agent_session_retired_claim_keys (key_id, retired_at) VALUES (?, ?) ON CONFLICT(key_id) DO NOTHING'
    )
    for (const entry of Array.isArray(file.retiredClaimKeys) ? file.retiredClaimKeys : []) {
      if (isReadableRetiredAgentSessionClaimKey(entry)) {
        insertKey.run(entry.keyId, entry.retiredAt)
      }
    }
    if (file.visibleSessionIds !== undefined) {
      writeTabs(db, seedTabs(file.visibleSessionIds, imported))
    }
  }
  db.prepare(
    'INSERT INTO agent_session_store_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
  ).run(RECORDS_IMPORT_MARKER, read.kind)
  return summary
}
