// One-time import of the chat history pre-merge Ether builds kept outside the host journal
// database. Delete once every Ether profile has opened on a build that ran it (docs/ether-maintenance.md).

import type { JournalHostDatabase } from '../agent-session-journal/journal-host-database'
import type { StructuredAgentSessionLogger } from '../agent-session-wire/structured-agent-session-logger'
import {
  legacyChatRecordsImported,
  readLegacyChatRecordsFile,
  writeLegacyChatRecords
} from './legacy-chat-records-import'
import { importLegacyChatJournals } from './legacy-chat-journals-import'

const SCOPE = 'ether-legacy-chat-import'

function importRecords(database: JournalHostDatabase, logger: StructuredAgentSessionLogger): void {
  if (legacyChatRecordsImported(database.db)) {
    return
  }
  const read = readLegacyChatRecordsFile(database.stateDirectory)
  const summary = database.transaction((db) => writeLegacyChatRecords(db, read))
  if (read.kind === 'unusable') {
    logger.warn('legacy chat records file is unreadable; no chats were imported', { scope: SCOPE })
  }
  if (summary.imported.length > 0 || summary.skippedOpenCode + summary.skippedUnreadable > 0) {
    logger.warn('imported legacy chat records', {
      scope: SCOPE,
      imported: summary.imported.length,
      skippedOpenCode: summary.skippedOpenCode,
      skippedUnreadable: summary.skippedUnreadable,
      fromBackup: summary.fromBackup,
      fileHostId: summary.fileHostId
    })
  }
}

function importJournals(database: JournalHostDatabase, logger: StructuredAgentSessionLogger): void {
  // A journal is placed by its chat's record, so it waits for the records import to finish.
  if (!legacyChatRecordsImported(database.db)) {
    return
  }
  const summary = importLegacyChatJournals(database, database.stateDirectory)
  for (const failure of summary.failures) {
    logger.warn('a legacy chat journal could not be imported; it is kept and retried next launch', {
      scope: SCOPE,
      path: failure.path,
      error: failure.error
    })
  }
  const counts: Record<string, number> = {}
  for (const outcome of summary.outcomes.values()) {
    counts[outcome] = (counts[outcome] ?? 0) + 1
  }
  if (summary.outcomes.size > 0) {
    logger.warn('imported legacy chat journals', { scope: SCOPE, ...counts })
  }
}

/** Records first, so each journal finds its chat's workspace. Never throws. */
export function importEtherLegacyChatHistory(
  database: JournalHostDatabase,
  logger: StructuredAgentSessionLogger
): void {
  if (database.readOnly) {
    return
  }
  for (const step of [importRecords, importJournals]) {
    try {
      step(database, logger)
    } catch (error) {
      logger.error('importing legacy chat history failed; the old files are kept', {
        scope: SCOPE,
        error
      })
    }
  }
}
