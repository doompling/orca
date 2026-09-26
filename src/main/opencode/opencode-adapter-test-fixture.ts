import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi, type Mock } from 'vitest'
import { z } from 'zod'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity,
  AgentSessionJournalIdentity
} from '../../shared/agent-session-journal-types'
import { createOpenCodeStructuredSessionAdapter } from './opencode-structured-session-adapter'
import {
  OpenCodeServerHttpError,
  type OpenCodeServerConnection,
  type OpenCodeServerConnectionHandlers
} from './opencode-server-connection-types'
import type { OpenCodeStructuredLaunch } from './opencode-structured-launch-resolution'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import type { OpenCodeStructuredSessionAdapterDeps } from './opencode-structured-session-state'
import type {
  AgentSessionAcquisition,
  AgentSessionDispatchOutcome
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'

type FixtureRequest = (method: string, path: string, body?: unknown) => Promise<unknown>
type FixtureAdapter = ReturnType<typeof createOpenCodeStructuredSessionAdapter>
export type OpenCodeAdapterFixture = {
  directory: string
  identity: AgentSessionJournalIdentity
  launch: OpenCodeStructuredLaunch
  rows: { identity: AgentJournalItemIdentity; body: AgentJournalItemBody }[]
  sink: StructuredAgentSessionEventSink
  request: Mock<FixtureRequest>
  close: Mock<() => Promise<boolean>>
  connection: OpenCodeServerConnection
  deps: OpenCodeStructuredSessionAdapterDeps
  adapter: FixtureAdapter
  onEvent: Mock<NonNullable<OpenCodeStructuredSessionAdapterDeps['onEvent']>>
  onDispatchSettledLate: Mock<
    NonNullable<OpenCodeStructuredSessionAdapterDeps['onDispatchSettledLate']>
  >
  defaultRequest: FixtureRequest
  readonly session: Record<string, unknown> | null
  setSession(value: Record<string, unknown>): void
  setHistory(value: unknown[]): void
  route(value: FixtureRequest | undefined): void
  emit(type: string, properties: Record<string, unknown>): void
  lose(): void
  acquire(fence?: number): Promise<AgentSessionAcquisition>
  dispatch(clientMessageId?: string): Promise<AgentSessionDispatchOutcome>
  cleanup(): Promise<void>
}

export async function openCodeAdapterFixture(): Promise<OpenCodeAdapterFixture> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-opencode-adapter-')))
  const identity: AgentSessionJournalIdentity = {
    sessionId: 'orca-session',
    workspaceId: 'folder:workspace',
    hostId: 'local',
    agent: 'opencode',
    providerHandle: { kind: 'opaque', agent: 'opencode', value: 'pending' }
  }
  const launch: OpenCodeStructuredLaunch = {
    command: 'opencode',
    cwd: directory,
    env: {},
    envToDelete: [],
    accountHome: { variable: 'XDG_DATA_HOME', path: directory },
    resumeSessionId: null,
    permissionRules: [{ permission: '*', pattern: '*', action: 'ask' }]
  }
  let handlers: OpenCodeServerConnectionHandlers = {}
  let closed = false
  let session: Record<string, unknown> | null = null
  let history: unknown[] = []
  let route: ((method: string, path: string, body?: unknown) => Promise<unknown>) | undefined
  const rows: { identity: AgentJournalItemIdentity; body: AgentJournalItemBody }[] = []
  const sink: StructuredAgentSessionEventSink = {
    appendItem: (id, body) => {
      rows.push({ identity: id, body })
    },
    appendTombstone: vi.fn(),
    publish: vi.fn()
  }
  const request = vi.fn(async (method: string, path: string, body?: unknown): Promise<unknown> => {
    if (route) {
      return route(method, path, body)
    }
    return defaultRequest(method, path, body)
  })
  async function defaultRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    if (path === '/provider') {
      return {
        all: [
          {
            id: 'test',
            name: 'Fixture',
            models: { small: { id: 'small', name: 'Small' }, other: { id: 'other', name: 'Other' } }
          }
        ],
        connected: ['test'],
        default: { test: 'small' }
      }
    }
    if (path === '/config') {
      return { model: 'test/small', permission: { bash: { 'rm *': 'deny' } } }
    }
    if (path === '/agent') {
      return [
        { name: 'build', permission: [{ permission: 'read', pattern: '.secret', action: 'deny' }] }
      ]
    }
    if (path === '/session' && method === 'POST') {
      session = { ...z.record(z.string(), z.unknown()).parse(body), id: 'ses_fixture', directory }
      return session
    }
    if (path === '/session/ses_fixture') {
      if (method === 'PATCH') {
        const update = z.record(z.string(), z.unknown()).parse(body)
        session = {
          ...session,
          ...update,
          ...(Array.isArray(update.permission)
            ? {
                permission: [
                  ...(Array.isArray(session?.permission) ? session.permission : []),
                  ...update.permission
                ]
              }
            : {})
        }
      }
      return session
    }
    if (path === '/session/ses_fixture/message') {
      return history
    }
    if (path.includes('/message/')) {
      throw new OpenCodeServerHttpError(404)
    }
    if (path === '/session/status') {
      return {}
    }
    if (path === '/permission' || path === '/question') {
      return []
    }
    if (path.startsWith('/api/session/')) {
      return { data: [] }
    }
    if (path.endsWith('/prompt_async')) {
      return null
    }
    if (path.endsWith('/reply') || path.endsWith('/abort')) {
      return true
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`)
  }
  const close = vi.fn(async () => {
    closed = true
    return true
  })
  const connection: OpenCodeServerConnection = {
    pid: 4242,
    get closed() {
      return closed
    },
    request,
    close,
    pauseReading: vi.fn(),
    resumeReading: vi.fn()
  }
  const onEvent = vi.fn()
  const onDispatchSettledLate = vi.fn()
  const deps: OpenCodeStructuredSessionAdapterDeps = {
    resolveLaunch: async () => launch,
    readProcessStartTime: async () => 100,
    openConnection: async (_input, value) => {
      handlers = value
      closed = false
      return connection
    },
    onEvent,
    onDispatchSettledLate
  }
  const adapter = createOpenCodeStructuredSessionAdapter(deps)
  return {
    directory,
    identity,
    launch,
    rows,
    sink,
    request,
    close,
    connection,
    deps,
    adapter,
    onEvent,
    onDispatchSettledLate,
    defaultRequest,
    get session() {
      return session
    },
    setSession: (value: Record<string, unknown>) => {
      session = value
    },
    setHistory: (value: unknown[]) => {
      history = value
    },
    route: (value: typeof route) => {
      route = value
    },
    emit: (type: string, properties: Record<string, unknown>) =>
      handlers.onEvent?.({ type, properties: { sessionID: 'ses_fixture', ...properties } }),
    lose: () => handlers.onConnectionLost?.(new Error('lost')),
    acquire: (fence = 1) =>
      adapter.acquire({ identity, fence, spawnToken: 'spawn-token', events: sink }),
    dispatch: (clientMessageId = 'client-one') =>
      adapter.dispatch({
        sessionId: identity.sessionId,
        clientMessageId,
        fence: 1,
        requestedAt: 1700000000000,
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'Hello' }] }
      }),
    cleanup: async () => {
      await adapter.closeAll()
      await rm(directory, { recursive: true, force: true })
    }
  }
}

export function openCodeUser(id = 'msg_user') {
  return { id, sessionID: 'ses_fixture', role: 'user', time: { created: 100 } }
}
export function openCodeText(messageID = 'msg_user', text = 'Hello') {
  return { id: 'prt_text', sessionID: 'ses_fixture', messageID, type: 'text', text }
}
