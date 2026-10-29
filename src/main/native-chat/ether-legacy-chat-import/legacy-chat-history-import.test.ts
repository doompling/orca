import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureLocalWorkspaceLaunchScope } from '../../../shared/local-projects/agent-launch-scope'
import Database from '../../sqlite/sync-database'
import { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import { openStructuredAgentSessionJournalDatabase } from '../../runtime/structured-agent-session-journal-open'
import type { JournalHostDatabase } from '../agent-session-journal/journal-host-database'
import { replayJournal } from '../agent-session-journal/journal-open'

const MULTI_ROOT = 'session-multi-root-1'
const PLAIN = 'session-plain-claude-1'
const OPENCODE = 'session-opencode-1'
const scope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace-a',
  projectId: 'project',
  defaultRootId: 'b',
  roots: [
    { id: 'a', label: 'App A', path: '/code/app-a' },
    { id: 'b', label: 'App B', path: '/code/app-b' }
  ]
})

const directories: string[] = []
const databases: JournalHostDatabase[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

/** A record as pre-merge Ether wrote it into agent-sessions.json. */
function legacyRecord(
  sessionId: string,
  provider: string,
  workspaceId: string,
  extra: Record<string, unknown>
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    sessionId,
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId,
      workspaceKind: workspaceId.startsWith('folder:') ? 'folder' : 'git-worktree'
    },
    provider,
    providerHandleChain: [],
    lease: {
      sessionId,
      runtimeKind: 'native',
      runtimeFence: 3,
      handoffStage: null,
      provenHandleLinkId: null,
      ownerProcess: null,
      reservedSpawnToken: null,
      leaseDeadlineAt: 0,
      lastRenewedAt: 0,
      handoffOperationId: null,
      journalCheckpoint: null,
      claimKeyId: 'key-1',
      claimStatus: 'released',
      unreconciled: false,
      deathEvidence: null
    },
    createdAt: 1_000,
    updatedAt: 2_000,
    ...extra
  }
}

function segment(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32)
}

/** A per-chat journal in the pre-merge schema: an epoch row and one item. */
function writeLegacyJournal(
  stateDirectory: string,
  workspaceId: string,
  sessionId: string
): string {
  const directory = join(
    stateDirectory,
    'agent-session-journal',
    segment(workspaceId),
    segment(sessionId)
  )
  mkdirSync(directory, { recursive: true })
  const path = join(directory, 'journal.db')
  const db = new Database(path)
  db.exec(`
CREATE TABLE journal_rows (session_id TEXT NOT NULL, epoch TEXT NOT NULL, seq INTEGER NOT NULL,
  ts INTEGER NOT NULL, row_json TEXT NOT NULL, PRIMARY KEY (session_id, epoch, seq));
CREATE TABLE journal_sessions (session_id TEXT PRIMARY KEY, epoch TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE journal_repairs (session_id TEXT PRIMARY KEY, epoch TEXT NOT NULL,
  content_from INTEGER NOT NULL, repaired_at INTEGER NOT NULL);`)
  db.pragma('user_version = 2')
  const base = { v: 3, epoch: 'epoch-legacy', fence: 3 }
  const rows = [
    {
      ...base,
      seq: 1,
      ts: 10,
      kind: 'epoch',
      reason: 'session_created',
      providerHandle: { kind: 'codex', threadId: 'thread-1' }
    },
    {
      ...base,
      seq: 2,
      ts: 11,
      kind: 'item',
      itemId: 'i',
      revision: 1,
      body: { kind: 'status', text: 'kept' }
    }
  ]
  const insert = db.prepare('INSERT INTO journal_rows VALUES (?, ?, ?, ?, ?)')
  rows.forEach((row) => insert.run(sessionId, row.epoch, row.seq, row.ts, JSON.stringify(row)))
  db.prepare('INSERT INTO journal_sessions VALUES (?, ?, ?)').run(sessionId, 'epoch-legacy', 11)
  db.close()
  return path
}

function legacyProfile(): { stateDirectory: string; files: string[] } {
  const stateDirectory = mkdtempSync(join(tmpdir(), 'ether-legacy-chat-'))
  directories.push(stateDirectory)
  const records = {
    [MULTI_ROOT]: legacyRecord(MULTI_ROOT, 'codex', 'folder:workspace-a', {
      accountHome: { variable: 'CODEX_HOME', path: '/home/dev/.codex' },
      localWorkspaceScope: scope
    }),
    [PLAIN]: legacyRecord(PLAIN, 'claude', 'repo-1::/code/repo', {
      accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: '/home/dev/.claude' }
    }),
    [OPENCODE]: legacyRecord(OPENCODE, 'opencode', 'repo-1::/code/repo', {
      accountHome: { variable: 'XDG_DATA_HOME', path: '/home/dev/.local/share' }
    })
  }
  mkdirSync(join(stateDirectory, 'agent-sessions'))
  const recordsFile = join(stateDirectory, 'agent-sessions', 'agent-sessions.json')
  writeFileSync(
    recordsFile,
    JSON.stringify({
      schemaVersion: 2,
      hostId: 'local',
      records,
      operations: {},
      retiredClaimKeys: [],
      unusableRecords: {},
      visibleSessionIds: [MULTI_ROOT, OPENCODE]
    })
  )
  return {
    stateDirectory,
    files: [
      recordsFile,
      writeLegacyJournal(stateDirectory, 'folder:workspace-a', MULTI_ROOT),
      writeLegacyJournal(stateDirectory, 'repo-1::/code/repo', PLAIN),
      writeLegacyJournal(stateDirectory, 'repo-1::/code/repo', OPENCODE)
    ]
  }
}

function open(stateDirectory: string): JournalHostDatabase {
  const logger = { warn: vi.fn(), error: vi.fn() }
  const database = openStructuredAgentSessionJournalDatabase({ stateDirectory, logger })
  databases.push(database)
  expect(logger.error).not.toHaveBeenCalled()
  return database
}

function digests(files: readonly string[]): string[] {
  return files.map((file) => createHash('sha256').update(readFileSync(file)).digest('hex'))
}

describe('pre-merge Ether chat history import', () => {
  it('imports records with their roots and every journal once, skipping OpenCode', () => {
    const { stateDirectory, files } = legacyProfile()
    const before = digests(files)
    const database = open(stateDirectory)
    const store = AgentSessionRecordStore.open({ journalDatabase: database, hostId: 'local' })

    expect(
      store
        .listRecords()
        .map((record) => record.sessionId)
        .sort()
    ).toEqual([MULTI_ROOT, PLAIN])
    expect(Reflect.get(store.getRecord(MULTI_ROOT) ?? {}, 'localWorkspaceScope')).toEqual(scope)
    expect(store.isSessionUnreadable(MULTI_ROOT)).toBe(false)
    for (const sessionId of [MULTI_ROOT, PLAIN]) {
      const load = replayJournal(database.db, sessionId)
      expect(load).toMatchObject({ damage: null, newer: null })
      expect(load?.state.items.size).toBe(1)
    }
    expect(replayJournal(database.db, OPENCODE)).toBeNull()
    expect(database.db.prepare('SELECT tab_id, session_id FROM agent_session_tabs').all()).toEqual([
      { tab_id: `structured-agent-session-${MULTI_ROOT}`, session_id: MULTI_ROOT }
    ])
    expect(digests(files)).toEqual(before)
  })

  it('does not import again on a later open, even if the old files change', () => {
    const { stateDirectory, files } = legacyProfile()
    open(stateDirectory).close()
    databases.splice(0)
    writeFileSync(files[0], JSON.stringify({ records: {} }))
    const database = open(stateDirectory)
    const rows = database.db.prepare('SELECT count(*) AS n FROM journal_rows').get()?.n
    expect(rows).toBe(4)
    expect(
      AgentSessionRecordStore.open({ journalDatabase: database, hostId: 'local' }).listRecords()
    ).toHaveLength(2)
    expect(readdirSync(join(stateDirectory, 'agent-session-journal'))).toHaveLength(2)
  })

  it('falls back to the backup records file with a raised fence floor', () => {
    const { stateDirectory, files } = legacyProfile()
    writeFileSync(`${files[0]}.bak`, readFileSync(files[0]))
    writeFileSync(files[0], '{ torn')
    const database = open(stateDirectory)
    const record = AgentSessionRecordStore.open({
      journalDatabase: database,
      hostId: 'local'
    }).getRecord(PLAIN)
    expect(record?.lease.minimumNextFence).toBe(5)
  })
})
