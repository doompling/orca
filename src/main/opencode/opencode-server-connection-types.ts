export type OpenCodeServerLaunch = {
  command: string
  cwd: string
  env?: Record<string, string>
  envToDelete?: readonly string[]
  spawnToken: string
}

export type OpenCodeServerConnectionHandlers = {
  onEvent?: (event: unknown) => void
  /** Transport loss does not prove that the owned process exited. */
  onConnectionLost?: (error: Error) => void
  onExit?: (error: Error) => void
}

export type OpenCodeServerRequestOptions = {
  timeoutMs?: number
  query?: Record<string, string>
}

export type OpenCodeServerConnection = {
  readonly pid: number | undefined
  readonly closed: boolean
  request: (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    options?: OpenCodeServerRequestOptions
  ) => Promise<unknown>
  pauseReading: () => void
  resumeReading: () => void
  /** True only after the owned child emitted exit/close; false retains ownership. */
  close: () => Promise<boolean>
}

export class OpenCodeServerHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenCode server returned HTTP ${status}.`)
    this.name = 'OpenCodeServerHttpError'
  }
}

export class OpenCodeServerStartupExitUnprovenError extends Error {
  constructor(readonly connection: OpenCodeServerConnection) {
    super('OpenCode server startup failed without process-exit proof.')
    this.name = 'OpenCodeServerStartupExitUnprovenError'
  }
}
