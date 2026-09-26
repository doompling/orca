import { describe, expect, it, vi } from 'vitest'
import {
  openOpenCodeServerConnection,
  OpenCodeServerStartupExitUnprovenError
} from './opencode-server-connection'
import { openCodeServerFixture } from './opencode-server-test-fixture'

describe('owned OpenCode server connection', () => {
  it('pins loopback, ephemeral port, random auth, directory, and the existing owner token', async () => {
    const fixture = openCodeServerFixture()
    const onEvent = vi.fn()
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      { onEvent },
      {
        ...fixture.deps,
        platform: 'win32'
      }
    )
    try {
      const spec = fixture.spawn.mock.calls[0]?.[0]
      expect(spec?.args).toEqual(['serve', '--hostname', '127.0.0.1', '--port', '0'])
      expect(spec?.env?.ORCA_AGENT_SESSION_SPAWN_TOKEN).toBe('owned-spawn-token')
      expect(spec?.env?.OPENCODE_SERVER_USERNAME).toBe('opencode')
      expect(spec?.env?.OPENCODE_SERVER_PASSWORD).not.toBe('must-be-replaced')
      expect(spec?.env?.OPENCODE_SERVER_PASSWORD).toHaveLength(43)
      expect(onEvent).toHaveBeenCalledWith({ type: 'server.connected' })
      await connection.request('GET', '/session/ses_1/message', undefined, {
        query: { limit: '20' }
      })
      const call = fixture.fetch.mock.calls.at(-1)
      const url = new URL(String(call?.[0]))
      expect(url.origin).toBe('http://127.0.0.1:45678')
      expect(url.username).toBe('')
      expect(url.password).toBe('')
      expect(url.searchParams.get('directory')).toBe(fixture.launch.cwd)
      expect(url.searchParams.get('limit')).toBe('20')
      expect(call?.[1]?.redirect).toBe('error')
      expect(new Headers(call?.[1]?.headers).get('authorization')).toBe(
        `Basic ${Buffer.from(`opencode:${spec?.env?.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`
      )
      expect(connection).not.toHaveProperty('url')
      expect(connection).not.toHaveProperty('authorization')
    } finally {
      expect(await connection.close()).toBe(true)
    }
  })

  it('uses the existing POSIX provider supervisor and strips requested inherited variables', async () => {
    const fixture = openCodeServerFixture()
    fixture.launch.env = { UNWANTED_PROVIDER_VALUE: 'remove-me' }
    fixture.launch.envToDelete = ['UNWANTED_PROVIDER_VALUE', 'OPENCODE_SERVER_PASSWORD']
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      {},
      {
        ...fixture.deps,
        platform: 'darwin'
      }
    )
    try {
      const spec = fixture.spawn.mock.calls[0]?.[0]
      expect(spec?.program).toBe(process.execPath)
      expect(spec?.detached).toBe(true)
      expect(spec?.env?.ELECTRON_RUN_AS_NODE).toBe('1')
      expect(spec?.env?.UNWANTED_PROVIDER_VALUE).toBeUndefined()
      expect(spec?.env?.OPENCODE_SERVER_PASSWORD).toHaveLength(43)
    } finally {
      await connection.close()
    }
  })

  it('reports SSE loss separately from actual owned child exit', async () => {
    const fixture = openCodeServerFixture()
    const onConnectionLost = vi.fn()
    const onExit = vi.fn()
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      { onConnectionLost, onExit },
      fixture.deps
    )
    fixture.endEvents()
    await vi.waitFor(() => expect(onConnectionLost).toHaveBeenCalledOnce())
    expect(connection.closed).toBe(true)
    expect(onExit).not.toHaveBeenCalled()
    await expect(connection.request('GET', '/session')).rejects.toThrow('unavailable')
    fixture.child.emit('exit', 1, null)
    fixture.child.emit('close', 1, null)
    expect(onExit).toHaveBeenCalledOnce()
    expect(await connection.close()).toBe(true)
  })

  it('retains unknown cleanup and retries until the child actually exits', async () => {
    const fixture = openCodeServerFixture()
    fixture.terminate.mockResolvedValue(false)
    const connection = await openOpenCodeServerConnection(fixture.launch, {}, fixture.deps)
    expect(await connection.close()).toBe(false)
    fixture.terminate.mockImplementationOnce(async () => true)
    expect(await connection.close()).toBe(false)
    fixture.terminate.mockImplementationOnce(async () => {
      fixture.child.emit('exit', 0, null)
      return true
    })
    expect(await connection.close()).toBe(true)
    expect(fixture.terminate).toHaveBeenCalledTimes(3)
  })

  it('keeps failed startup reachable when cleanup lacks exit proof', async () => {
    const fixture = openCodeServerFixture()
    fixture.fetch.mockResolvedValue(Response.json({ healthy: false }))
    fixture.terminate.mockResolvedValue(false)
    let retained: OpenCodeServerStartupExitUnprovenError | undefined
    try {
      await openOpenCodeServerConnection(fixture.launch, {}, fixture.deps)
    } catch (error) {
      if (error instanceof OpenCodeServerStartupExitUnprovenError) {
        retained = error
      } else {
        throw error
      }
    }
    expect(retained?.connection.pid).toBe(fixture.child.pid)
    fixture.child.emit('close', 0, null)
    expect(await retained?.connection.close()).toBe(true)
  })

  it('requires subscription acknowledgement before returning a connection', async () => {
    const fixture = openCodeServerFixture()
    const original = fixture.fetch.getMockImplementation()
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined
    fixture.fetch.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname !== '/event' && original) {
        return original(input, init)
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            stream = controller
          }
        }),
        {
          headers: { 'content-type': 'text/event-stream' }
        }
      )
    })
    let returned = false
    const pending = openOpenCodeServerConnection(fixture.launch, {}, fixture.deps).then(
      (connection) => {
        returned = true
        return connection
      }
    )
    await vi.waitFor(() => expect(stream).toBeDefined())
    expect(returned).toBe(false)
    stream?.enqueue(Buffer.from('data: {"type":"server.connected"}\n\n'))
    const connection = await pending
    stream?.close()
    await connection.close()
  })

  it('pauses between events already received in the same chunk', async () => {
    const fixture = openCodeServerFixture()
    const events: unknown[] = []
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      {
        onEvent: (event) => {
          events.push(event)
          if (events.length === 2) {
            connection.pauseReading()
          }
        }
      },
      fixture.deps
    )
    fixture.event('data: {"type":"one"}\n\ndata: {"type":"two"}\n\n')
    await vi.waitFor(() => expect(events).toHaveLength(2))
    connection.resumeReading()
    await vi.waitFor(() => expect(events).toHaveLength(3))
    await connection.close()
  })
})
