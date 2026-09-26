import { openCodeRequestUrl } from './opencode-server-http'

const MAX_EVENT_BYTES = 1024 * 1024

export class OpenCodeEventDecoder {
  private line = ''
  private data: string[] = []
  private bytes = 0
  private pending = ''

  constructor(
    private readonly onEvent: (event: unknown) => void,
    private readonly isPaused: () => boolean = () => false
  ) {}

  push(text: string): void {
    if (Buffer.byteLength(text) + Buffer.byteLength(this.pending) > MAX_EVENT_BYTES) {
      throw new Error('OpenCode event chunk exceeded its size limit.')
    }
    this.pending += text
    this.drain()
  }

  drain(): void {
    while (this.pending && !this.isPaused()) {
      const boundary = this.pending.indexOf('\n')
      const length = boundary === -1 ? this.pending.length : boundary + 1
      const segment = this.pending.slice(0, length)
      this.pending = this.pending.slice(length)
      this.bytes += Buffer.byteLength(segment)
      if (this.bytes > MAX_EVENT_BYTES) {
        throw new Error('OpenCode event exceeded its size limit.')
      }
      this.line += segment
      if (!this.line.endsWith('\n')) {
        continue
      }
      const line = this.line.replace(/\r?\n$/, '')
      this.line = ''
      if (line === '') {
        const data = this.data.join('\n')
        this.data = []
        this.bytes = 0
        if (data) {
          let event: unknown
          try {
            event = JSON.parse(data)
          } catch {
            throw new Error('OpenCode event contained invalid JSON.')
          }
          this.onEvent(event)
        }
      } else if (line.startsWith('data:')) {
        this.data.push(line.slice(5).replace(/^ /, ''))
      }
    }
  }
}

export function startOpenCodeEvents(args: {
  origin: string
  cwd: string
  authorization: string
  fetch: typeof fetch
  onEvent: (event: unknown) => void
  onConnectionLost: (error: Error) => void
  startupTimeoutMs: number
}) {
  const controller = new AbortController()
  const ready = Promise.withResolvers<void>()
  let connected = false
  let stopped = false
  let paused = false
  let releasePause: (() => void) | undefined
  const startupTimer = setTimeout(() => controller.abort(), args.startupTimeoutMs)

  const decoder = new OpenCodeEventDecoder(
    (event) => {
      if (!connected) {
        if (
          typeof event !== 'object' ||
          event === null ||
          !('type' in event) ||
          event.type !== 'server.connected'
        ) {
          throw new Error('OpenCode event stream did not confirm subscription.')
        }
        connected = true
        clearTimeout(startupTimer)
        ready.resolve()
      }
      args.onEvent(event)
    },
    () => paused
  )

  async function pump(): Promise<void> {
    const response = await args.fetch(openCodeRequestUrl(args.origin, args.cwd, '/event'), {
      headers: { authorization: args.authorization, accept: 'text/event-stream' },
      redirect: 'error',
      signal: controller.signal
    })
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith('text/event-stream')
    ) {
      await response.body?.cancel()
      throw new Error('OpenCode event subscription was refused.')
    }
    const reader = response.body.getReader()
    const text = new TextDecoder('utf-8', { fatal: true })
    try {
      for (;;) {
        if (paused) {
          await new Promise<void>((resolve) => {
            releasePause = resolve
          })
        }
        if (stopped) {
          return
        }
        decoder.drain()
        if (paused) {
          continue
        }
        // An idle subscribed chat need not produce events; absence is not a transport failure.
        const part = await reader.read()
        if (part.done) {
          throw new Error('OpenCode event stream ended.')
        }
        decoder.push(text.decode(part.value, { stream: true }))
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  void pump()
    .catch(() => {
      const error = new Error('OpenCode event connection was lost; process exit is unverified.')
      ready.reject(error)
      if (!stopped) {
        args.onConnectionLost(error)
      }
    })
    .finally(() => {
      clearTimeout(startupTimer)
    })

  return {
    ready: ready.promise,
    stop: () => {
      stopped = true
      clearTimeout(startupTimer)
      controller.abort()
      releasePause?.()
    },
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
      releasePause?.()
      releasePause = undefined
    }
  }
}
