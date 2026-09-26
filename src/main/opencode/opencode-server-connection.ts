import { randomBytes } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { createOpenCodeHttpClient } from './opencode-server-http'
import { startOpenCodeEvents } from './opencode-server-events'
import {
  startOpenCodeServerProcess,
  type OpenCodeServerProcessDependencies
} from './opencode-server-process'
import {
  OpenCodeServerStartupExitUnprovenError,
  type OpenCodeServerConnection,
  type OpenCodeServerConnectionHandlers,
  type OpenCodeServerLaunch
} from './opencode-server-connection-types'

export * from './opencode-server-connection-types'

export type OpenCodeServerConnectionDependencies = OpenCodeServerProcessDependencies & {
  fetch?: typeof fetch
}

export async function openOpenCodeServerConnection(
  launch: OpenCodeServerLaunch,
  handlers: OpenCodeServerConnectionHandlers = {},
  deps: OpenCodeServerConnectionDependencies = {}
): Promise<OpenCodeServerConnection> {
  if (!launch.command || !isAbsolute(launch.cwd) || !launch.spawnToken) {
    throw new Error('OpenCode requires an owned native launch and absolute directory.')
  }
  const password = randomBytes(32).toString('base64url')
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`
  let closing = false
  let lost: Error | null = null
  let http: ReturnType<typeof createOpenCodeHttpClient> | undefined
  let events: ReturnType<typeof startOpenCodeEvents> | undefined

  function loseContact(): void {
    if (closing || lost) {
      return
    }
    lost = new Error('OpenCode server connection was lost; process exit is unverified.')
    http?.abort()
    events?.stop()
    try {
      handlers.onConnectionLost?.(lost)
    } catch {
      // A consumer failure cannot turn lost contact into exit proof.
    }
  }

  const owned = startOpenCodeServerProcess(
    launch,
    password,
    () => {
      try {
        handlers.onExit?.(new Error('The owned OpenCode server process exited.'))
      } catch {
        // Child lifecycle listeners must not throw into the process event loop.
      }
    },
    loseContact,
    deps
  )
  const connection: OpenCodeServerConnection = {
    get pid() {
      return owned.child.pid
    },
    get closed() {
      return closing || owned.exited || lost !== null
    },
    request: (method, path, body, options) => {
      if (!http) {
        return Promise.reject(new Error('OpenCode server has not completed startup.'))
      }
      return http.request(method, path, body, options)
    },
    pauseReading: () => events?.pause(),
    resumeReading: () => events?.resume(),
    close: () => {
      closing = true
      events?.stop()
      http?.abort()
      return owned.close()
    }
  }
  try {
    const origin = await owned.ready
    http = createOpenCodeHttpClient({
      origin,
      cwd: launch.cwd,
      authorization,
      fetch: deps.fetch ?? fetch,
      assertAvailable: () => {
        if (connection.closed) {
          throw new Error('OpenCode server connection is unavailable.')
        }
      }
    })
    const health = await http.request('GET', '/global/health', undefined, { timeoutMs: 5_000 })
    if (
      typeof health !== 'object' ||
      health === null ||
      !('healthy' in health) ||
      health.healthy !== true
    ) {
      throw new Error('OpenCode server health check failed.')
    }
    events = startOpenCodeEvents({
      origin,
      cwd: launch.cwd,
      authorization,
      fetch: deps.fetch ?? fetch,
      onEvent: (event) => handlers.onEvent?.(event),
      onConnectionLost: loseContact,
      startupTimeoutMs: deps.startupTimeoutMs ?? 10_000
    })
    await events.ready
    if (connection.closed) {
      throw new Error('OpenCode server exited during startup.')
    }
    return connection
  } catch {
    if (!(await connection.close())) {
      throw new OpenCodeServerStartupExitUnprovenError(connection)
    }
    throw new Error('OpenCode server could not establish a private connection.')
  }
}
