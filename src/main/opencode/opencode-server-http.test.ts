import { describe, expect, it, vi } from 'vitest'
import { createOpenCodeHttpClient, openCodeRequestUrl } from './opencode-server-http'
import { OpenCodeServerHttpError } from './opencode-server-connection-types'

function client(fetchImpl: typeof fetch) {
  return createOpenCodeHttpClient({
    origin: 'http://127.0.0.1:12345',
    cwd: '/workspace with spaces',
    authorization: 'Basic private-test-credential',
    fetch: fetchImpl,
    assertAvailable: () => undefined
  })
}

describe('private OpenCode HTTP requests', () => {
  it.each([
    'https://other.test',
    '//other.test/session',
    '/session?directory=elsewhere',
    '/a#b',
    '/a/../b'
  ])('refuses non-owned request target %s', (path) => {
    expect(() => openCodeRequestUrl('http://127.0.0.1:12345', '/owned', path)).toThrow()
  })

  it.each(['directory', 'workspace'])('refuses %s scope overrides', (key) => {
    expect(() =>
      openCodeRequestUrl('http://127.0.0.1:12345', '/owned', '/session', {
        [key]: 'elsewhere'
      })
    ).toThrow('override')
  })

  it('returns null for204 and a typed status without echoing error response contents', async () => {
    const request = client(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response('private-provider-content', { status: 404 }))
    ).request
    expect(await request('POST', '/session/ses_1/prompt_async', { parts: [] })).toBeNull()
    try {
      await request('GET', '/session/ses_missing')
      throw new Error('Expected404')
    } catch (error) {
      expect(error).toBeInstanceOf(OpenCodeServerHttpError)
      if (error instanceof OpenCodeServerHttpError) {
        expect(error.status).toBe(404)
        expect(error.message).not.toContain('private-provider-content')
      }
    }
  })

  it('bounds outgoing and incoming bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)))
    const request = client(fetchImpl).request
    await expect(request('POST', '/session', 'x'.repeat(2 * 1024 * 1024))).rejects.toThrow(
      'size limit'
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(request('GET', '/session')).rejects.toThrow('invalid response')
  })

  it('cancels a stalled body at the per-request deadline', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')))
            }
          })
        )
    )
    await expect(
      client(fetchImpl).request('GET', '/session', undefined, { timeoutMs: 5 })
    ).rejects.toThrow('deadline')
  })

  it('aborts pending fetches on close without exposing original transport details', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('secret-header')))
        })
    )
    const transport = client(fetchImpl)
    const pending = transport.request('GET', '/session')
    transport.abort()
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('bounds concurrent requests and deadline values', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const transport = client(fetchImpl)
    await expect(
      transport.request('GET', '/session', undefined, { timeoutMs: Number.NaN })
    ).rejects.toThrow('deadline')
    const pending = Array.from({ length: 32 }, () => transport.request('GET', '/session'))
    const settled = Promise.allSettled(pending)
    await expect(transport.request('GET', '/session')).rejects.toThrow('Too many')
    transport.abort()
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true)
  })
})
