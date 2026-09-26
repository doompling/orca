import { describe, expect, it, vi } from 'vitest'
import { OpenCodeEventDecoder } from './opencode-server-events'
import { openOpenCodeServerConnection } from './opencode-server-connection'
import { openCodeServerFixture } from './opencode-server-test-fixture'

describe('bounded OpenCode event stream', () => {
  it('decodes split CRLF, comments, multiline data, and non-data SSE fields', () => {
    const events: unknown[] = []
    const decoder = new OpenCodeEventDecoder((event) => events.push(event))
    decoder.push(': heartbeat\r')
    decoder.push('\nid: 1\r\nevent: message\r\ndata: {"type":\r\ndata: "message.updated"}\r\n\r')
    decoder.push('\n')
    expect(events).toEqual([{ type: 'message.updated' }])
  })

  it('rejects malformed JSON and frames without a bounded delimiter', () => {
    const decoder = new OpenCodeEventDecoder(() => undefined)
    expect(() => decoder.push('data: nope\n\n')).toThrow('invalid JSON')
    expect(() => decoder.push('x'.repeat(1024 * 1024 + 1))).toThrow('size limit')
  })

  it('does not buffer an unlimited multiline event', () => {
    const decoder = new OpenCodeEventDecoder(() => undefined)
    decoder.push(`data: ${'x'.repeat(600_000)}\n`)
    expect(() => decoder.push(`data: ${'x'.repeat(600_000)}\n`)).toThrow('size limit')
  })

  it('does not expire a successfully subscribed but quiet chat', async () => {
    const fixture = openCodeServerFixture()
    const onConnectionLost = vi.fn()
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      { onConnectionLost },
      fixture.deps
    )
    vi.useFakeTimers()
    try {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(connection.closed).toBe(false)
      expect(onConnectionLost).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      await connection.close()
    }
  })

  it('fails startup without subscription proof and reaps only its owned child', async () => {
    const fixture = openCodeServerFixture()
    const original = fixture.fetch.getMockImplementation()
    fixture.fetch.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname !== '/event' && original) {
        return original(input, init)
      }
      return new Response('data: {"type":"not-connected"}\n\n', {
        headers: { 'content-type': 'text/event-stream' }
      })
    })
    await expect(openOpenCodeServerConnection(fixture.launch, {}, fixture.deps)).rejects.toThrow(
      'private connection'
    )
    expect(fixture.terminate).toHaveBeenCalledWith(fixture.child, fixture.launch.spawnToken)
  })

  it('turns malformed events and consumer exceptions into contact loss, never exit', async () => {
    const fixture = openCodeServerFixture()
    const onExit = vi.fn()
    const onConnectionLost = vi.fn(() => {
      throw new Error('consumer failure')
    })
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      { onExit, onConnectionLost },
      fixture.deps
    )
    fixture.event('data: not-json\n\n')
    await vi.waitFor(() => expect(onConnectionLost).toHaveBeenCalledOnce())
    expect(onExit).not.toHaveBeenCalled()
    await connection.close()
  })
})
