import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { vi } from 'vitest'
import type { ProcessSpec } from '../../shared/child-process/run-process'
import type { OpenCodeServerLaunch } from './opencode-server-connection'

export class FakeOpenCodeChild extends EventEmitter {
  readonly pid = 42_424
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly kill = vi.fn(() => true)
}

export function openCodeServerFixture() {
  const child = new FakeOpenCodeChild()
  const launch: OpenCodeServerLaunch = {
    command: 'opencode',
    cwd: process.cwd(),
    spawnToken: 'owned-spawn-token',
    env: { OPENCODE_SERVER_PASSWORD: 'must-be-replaced' }
  }
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname !== '/event') {
      return Response.json(url.pathname === '/global/health' ? { healthy: true } : { ok: true })
    }
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
          init?.signal?.addEventListener('abort', () => {
            try {
              controller.error(new Error('Aborted'))
            } catch {
              // The fixture stream may already have ended.
            }
          })
          controller.enqueue(Buffer.from('data: {"type":"server.connected"}\n\n'))
        }
      }),
      { headers: { 'content-type': 'text/event-stream' } }
    )
  })
  const spawn = vi.fn((_spec: ProcessSpec) => {
    queueMicrotask(() =>
      child.stdout.write('opencode server listening on http://127.0.0.1:45678\n')
    )
    return child
  })
  const terminate = vi.fn(async () => {
    child.emit('exit', 0, null)
    return true
  })
  return {
    launch,
    child,
    fetch: fetchImpl,
    spawn,
    terminate,
    deps: { fetch: fetchImpl, spawn, terminate, exitTimeoutMs: 1, startupTimeoutMs: 1_000 },
    event: (text: string) => streamController?.enqueue(Buffer.from(text)),
    endEvents: () => streamController?.close()
  }
}
