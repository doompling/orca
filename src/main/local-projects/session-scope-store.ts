import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { AgentSessionExecutionLocation } from '../../shared/agent-session-record'
import {
  copyLocalWorkspaceLaunchScope,
  localWorkspaceLaunchScopesEqual,
  LocalWorkspaceLaunchScopeSchema,
  type LocalWorkspaceLaunchScope
} from '../../shared/local-projects/agent-launch-scope'
import { isLocalWorkspaceSessionScope } from '../../shared/local-projects/agent-session-scope'
import { agentSessionRefusalError } from '../../shared/agent-session-wire-refusals'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'

/**
 * The roots each local Workspace chat was created with, keyed by session ID. Kept beside the
 * agent-session database instead of on upstream's record, so the record schema stays upstream's.
 * Written synchronously before the chat is reserved, so a chat never exists without its roots.
 */
const ScopeFileSchema = z.object({
  version: z.literal(1),
  scopes: z.record(z.string(), LocalWorkspaceLaunchScopeSchema)
})

type ScopedSession = { sessionId: string; location: AgentSessionExecutionLocation }

let filePath: string | undefined
let scopes: Map<string, LocalWorkspaceLaunchScope> | undefined

/** Tests point the store at a temporary file; the app uses the profile's user-data folder. */
export function setSessionScopeFileForTests(path: string | undefined): void {
  filePath = path
  scopes = undefined
}

function scopeFile(): string {
  return filePath ?? join(getProfileUserDataPath(), 'ether-agent-session-scopes.json')
}

function loaded(): Map<string, LocalWorkspaceLaunchScope> {
  if (scopes) {
    return scopes
  }
  const path = scopeFile()
  if (!existsSync(path)) {
    scopes = new Map()
    return scopes
  }
  const parsed = ScopeFileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) {
    // Refuse rather than start chats without their roots or overwrite what we cannot read.
    throw new Error(`Local Workspace chat roots are unreadable: ${path}`)
  }
  scopes = new Map(Object.entries(parsed.data.scopes))
  return scopes
}

function persist(next: Map<string, LocalWorkspaceLaunchScope>): void {
  const path = scopeFile()
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify({ version: 1, scopes: Object.fromEntries(next) }))
  renameSync(temporary, path)
  scopes = next
}

/**
 * Freezes a chat's roots. A session that already has roots keeps them unless `replaceable` says
 * nothing has run under them yet (a create that failed before its record was written).
 */
export function rememberSessionScope(
  session: ScopedSession,
  scope: LocalWorkspaceLaunchScope,
  replaceable: boolean
): void {
  if (!isLocalWorkspaceSessionScope(scope, session.location)) {
    throw new Error('agent_session_operation_invalid')
  }
  const current = loaded()
  const existing = current.get(session.sessionId)
  if (existing && localWorkspaceLaunchScopesEqual(existing, scope)) {
    return
  }
  if (existing && !replaceable) {
    throw agentSessionRefusalError('agent_session_conflict', { reason: 'identityMismatch' })
  }
  persist(new Map(current).set(session.sessionId, copyLocalWorkspaceLaunchScope(scope)))
}

/** Records written before the scope store carried the roots on the record itself. */
function legacyRecordScope(record: object): LocalWorkspaceLaunchScope | undefined {
  const parsed = LocalWorkspaceLaunchScopeSchema.safeParse(
    Reflect.get(record, 'localWorkspaceScope')
  )
  return parsed.success ? parsed.data : undefined
}

/** The roots a chat was created with, or undefined for a chat outside a local Workspace. */
export function sessionScopeFor(session: ScopedSession): LocalWorkspaceLaunchScope | undefined {
  const stored = loaded().get(session.sessionId)
  if (stored) {
    return copyLocalWorkspaceLaunchScope(stored)
  }
  const legacy = legacyRecordScope(session)
  if (!legacy || !isLocalWorkspaceSessionScope(legacy, session.location)) {
    return undefined
  }
  persist(new Map(loaded()).set(session.sessionId, legacy))
  return copyLocalWorkspaceLaunchScope(legacy)
}
