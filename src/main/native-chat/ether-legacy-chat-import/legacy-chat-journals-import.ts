// Copies each pre-merge per-chat `agent-session-journal/<ws>/<session>/journal.db` into the host
// journal database, verbatim: same epoch, sequence numbers, timestamps and row bytes. A chat is
// copied in one transaction with its pointer and a `journal_imports` marker, so it lands whole or
// not at all. The legacy files are opened read-only and never changed.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import Database from '../../sqlite/sync-database'
import type { JournalHostDatabase } from '../agent-session-journal/journal-host-database'
import {
  publishJournalSessionEpoch,
  readJournalSessionEpoch
} from '../agent-session-journal/journal-row-table'

/** The newest per-chat file shape any build wrote. */
const LEGACY_JOURNAL_SCHEMA_VERSION = 2
const PAGE_ROWS = 512
const JOURNALS_IMPORT_MARKER = 'ether_legacy_journals_import'

export type LegacyChatJournalOutcome =
  | 'imported'
  | 'already-imported'
  | 'empty'
  | 'no-record'
  | 'path-mismatch'

export type LegacyChatJournalFailure = { path: string; error: unknown }

export type LegacyChatJournalsImport = {
  outcomes: Map<string, LegacyChatJournalOutcome>
  failures: LegacyChatJournalFailure[]
}

function pathSegment(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32)
}

function childDirectories(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name))
}

export function legacyChatJournalFiles(stateDirectory: string): string[] {
  const root = join(stateDirectory, 'agent-session-journal')
  if (!existsSync(root)) {
    return []
  }
  return childDirectories(root)
    .flatMap(childDirectories)
    .map((directory) => join(directory, 'journal.db'))
    .filter((path) => existsSync(path))
    .sort()
}

function recordWorkspaceId(db: Database.Database, sessionId: string): string | null {
  const json = db
    .prepare('SELECT record_json FROM agent_session_records WHERE session_id = ?')
    .get(sessionId)?.record_json
  if (typeof json !== 'string') {
    return null
  }
  try {
    const record: unknown = JSON.parse(json)
    const location =
      typeof record === 'object' && record !== null && 'location' in record ? record.location : null
    const workspaceId =
      typeof location === 'object' && location !== null && 'workspaceId' in location
        ? location.workspaceId
        : null
    return typeof workspaceId === 'string' ? workspaceId : null
  } catch {
    return null
  }
}

function copyChat(
  database: JournalHostDatabase,
  source: Database.Database,
  file: string,
  sessionId: string,
  epoch: string
): LegacyChatJournalOutcome {
  const host = database.db
  const workspaceId = recordWorkspaceId(host, sessionId)
  if (workspaceId === null) {
    return 'no-record'
  }
  const sessionDirectory = basename(join(file, '..'))
  const workspaceDirectory = basename(join(file, '..', '..'))
  if (
    sessionDirectory !== pathSegment(sessionId) ||
    workspaceDirectory !== pathSegment(workspaceId)
  ) {
    return 'path-mismatch'
  }
  const marked = host.prepare('SELECT 1 AS present FROM journal_imports WHERE session_id = ?')
  if (marked.get(sessionId) || readJournalSessionEpoch(host, sessionId) !== null) {
    return 'already-imported'
  }
  const select = source.prepare(
    'SELECT seq, ts, row_json FROM journal_rows WHERE session_id = ? AND epoch = ? AND seq > ? ORDER BY seq ASC LIMIT ?'
  )
  database.transaction((db) => {
    const insert = db.prepare(
      'INSERT INTO journal_rows (session_id, epoch, seq, ts, row_json) VALUES (?, ?, ?, ?, ?)'
    )
    let afterSeq = Number.MIN_SAFE_INTEGER
    let tip = 0
    for (;;) {
      const rows = select.all(sessionId, epoch, afterSeq, PAGE_ROWS)
      for (const row of rows) {
        insert.run(sessionId, epoch, Number(row.seq), Number(row.ts), String(row.row_json))
        tip = Math.max(tip, Number(row.seq))
      }
      if (rows.length < PAGE_ROWS) {
        break
      }
      afterSeq = Number(rows.at(-1)?.seq)
    }
    publishJournalSessionEpoch(db, { sessionId, workspaceId }, epoch)
    db.prepare('INSERT INTO journal_imports (session_id, epoch, tip) VALUES (?, ?, ?)').run(
      sessionId,
      epoch,
      tip
    )
  })
  return 'imported'
}

function importJournalFile(
  database: JournalHostDatabase,
  file: string,
  outcomes: Map<string, LegacyChatJournalOutcome>
): void {
  const source = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const version = Number(source.pragma('user_version', { simple: true }) ?? 0)
    if (version > LEGACY_JOURNAL_SCHEMA_VERSION) {
      throw new Error(`per-chat journal uses schema ${version}, which no Ether build wrote`)
    }
    const hasSessions = source
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get('journal_sessions')
    if (!hasSessions) {
      outcomes.set(file, 'empty')
      return
    }
    const sessions = source.prepare('SELECT session_id, epoch FROM journal_sessions').all()
    if (sessions.length === 0) {
      outcomes.set(file, 'empty')
    }
    for (const { session_id: sessionId, epoch } of sessions) {
      if (typeof sessionId === 'string' && typeof epoch === 'string' && epoch.length > 0) {
        outcomes.set(sessionId, copyChat(database, source, file, sessionId, epoch))
      }
    }
  } finally {
    source.close()
  }
}

/** Runs until one pass reads every file; a file that fails is retried on the next launch. */
export function importLegacyChatJournals(
  database: JournalHostDatabase,
  stateDirectory: string
): LegacyChatJournalsImport {
  const summary: LegacyChatJournalsImport = { outcomes: new Map(), failures: [] }
  const meta = database.db.prepare(
    'SELECT 1 AS present FROM agent_session_store_meta WHERE key = ?'
  )
  if (meta.get(JOURNALS_IMPORT_MARKER)) {
    return summary
  }
  for (const file of legacyChatJournalFiles(stateDirectory)) {
    try {
      importJournalFile(database, file, summary.outcomes)
    } catch (error) {
      summary.failures.push({ path: file, error })
    }
  }
  if (summary.failures.length === 0) {
    database.transaction((db) =>
      db
        .prepare('INSERT INTO agent_session_store_meta (key, value) VALUES (?, ?)')
        .run(JOURNALS_IMPORT_MARKER, String(summary.outcomes.size))
    )
  }
  return summary
}
