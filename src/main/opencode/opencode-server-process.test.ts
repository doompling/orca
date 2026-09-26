import { describe, expect, it, vi } from 'vitest'
import { openOpenCodeServerConnection } from './opencode-server-connection'
import { openCodeServerFixture } from './opencode-server-test-fixture'

describe('OpenCode private listener startup', () => {
  it('waits for a complete readiness line rather than connecting to a truncated port', async () => {
    const fixture = openCodeServerFixture()
    fixture.spawn.mockImplementationOnce(() => fixture.child)
    const pending = openOpenCodeServerConnection(fixture.launch, {}, fixture.deps)
    fixture.child.stdout.write('opencode server listening on http://127.0.0.1:45')
    expect(fixture.fetch).not.toHaveBeenCalled()
    fixture.child.stdout.write('678\n')
    const connection = await pending
    expect(String(fixture.fetch.mock.calls[0]?.[0])).toContain('127.0.0.1:45678/')
    await connection.close()
  })

  it.each([
    'http://0.0.0.0:1234',
    'http://other.test:1234',
    'http://127.0.0.1:0',
    'http://127.0.0.1:99999'
  ])('does not connect to an unowned or invalid listener %s', async (url) => {
    const fixture = openCodeServerFixture()
    fixture.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => fixture.child.stdout.write(`${url}\n`))
      return fixture.child
    })
    await expect(
      openOpenCodeServerConnection(
        fixture.launch,
        {},
        {
          ...fixture.deps,
          startupTimeoutMs: 10
        }
      )
    ).rejects.toThrow('private connection')
    expect(fixture.fetch).not.toHaveBeenCalled()
    expect(fixture.terminate).toHaveBeenCalledOnce()
  })

  it('bounds startup output and never returns provider output in the failure', async () => {
    const fixture = openCodeServerFixture()
    fixture.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => fixture.child.stdout.write(`secret-output-${'x'.repeat(65_536)}`))
      return fixture.child
    })
    await expect(openOpenCodeServerConnection(fixture.launch, {}, fixture.deps)).rejects.toThrow(
      'private connection'
    )
    expect(fixture.fetch).not.toHaveBeenCalled()
  })

  it('reports an error event as unverified until close is actually observed', async () => {
    const fixture = openCodeServerFixture()
    const onExit = vi.fn()
    const onConnectionLost = vi.fn()
    const connection = await openOpenCodeServerConnection(
      fixture.launch,
      { onExit, onConnectionLost },
      fixture.deps
    )
    fixture.child.emit('error', new Error('secret process diagnostic'))
    expect(onConnectionLost).toHaveBeenCalledOnce()
    expect(onExit).not.toHaveBeenCalled()
    expect(onConnectionLost.mock.calls[0]?.[0]?.message).not.toContain('secret')
    fixture.child.emit('close', null, null)
    expect(onExit).toHaveBeenCalledOnce()
    await connection.close()
  })
})
