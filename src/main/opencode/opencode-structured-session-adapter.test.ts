import { afterEach, describe, expect, it, vi } from 'vitest'
import { openCodeAdapterFixture, openCodeText, openCodeUser } from './opencode-adapter-test-fixture'
import { openCodeClientMessageId } from './opencode-session-dispatch'
import { createOpenCodeStructuredSessionAdapter } from './opencode-structured-session-adapter'
import { OpenCodeServerHttpError } from './opencode-server-connection-types'

const fixtures: Awaited<ReturnType<typeof openCodeAdapterFixture>>[] = []
async function fixture() {
  const value = await openCodeAdapterFixture()
  fixtures.push(value)
  return value
}
afterEach(async () => {
  for (const value of fixtures.splice(0)) {
    await value.cleanup()
  }
})

describe('OpenCode native adapter', () => {
  it('creates an owned session with exact deny-preserving permission rules and model catalog', async () => {
    const f = await fixture()
    const acquired = await f.acquire()
    expect(acquired.process).toEqual({
      hostId: 'local',
      pid: 4242,
      processStartTimeMs: 100,
      spawnToken: 'spawn-token'
    })
    expect(acquired.link.handle).toEqual({ provider: 'opencode', sessionId: 'ses_fixture' })
    expect(f.session?.permission).toEqual([
      ...f.launch.permissionRules,
      { permission: 'bash', pattern: 'rm *', action: 'deny' },
      { permission: 'read', pattern: '.secret', action: 'deny' }
    ])
    expect(await f.adapter.readOptions?.({ sessionId: 'orca-session', fence: 1 })).toMatchObject({
      current: { model: 'test/small' },
      models: [{ efforts: [] }, { efforts: [] }]
    })
    expect(
      f.request.mock.calls.some(([method, path]) => method === 'PATCH' && path === '/config')
    ).toBe(false)
    expect(f.request.mock.calls.some(([, path]) => path.startsWith('/api/session/'))).toBe(false)
  })
  it('keeps errors from the matching v1 permission API fatal during acquisition', async () => {
    const f = await fixture()
    f.route(async (method, path, body) => {
      if (path === '/permission') {
        throw new OpenCodeServerHttpError(500)
      }
      return f.defaultRequest(method, path, body)
    })
    await expect(f.acquire()).rejects.toThrow('HTTP 500')
    expect(f.close).toHaveBeenCalledOnce()
  })
  it('reopens only the saved provider identity, cwd and frozen metadata scope', async () => {
    const f = await fixture()
    await f.acquire()
    await f.adapter.closeSession?.('orca-session')
    f.launch.resumeSessionId = 'ses_fixture'
    expect((await f.acquire(2)).link.origin).toBe('resumed')
    expect(f.request.mock.calls.some(([method]) => method === 'PATCH')).toBe(false)
    await f.adapter.closeSession?.('orca-session')
    f.setSession({
      ...f.session,
      id: 'ses_fixture',
      directory: f.directory,
      metadata: { orcaSessionId: 'another' }
    })
    await expect(f.acquire(3)).rejects.toThrow('different saved Workspace scope')
  })
  it('verifies appended policy changes, then reopens without growing the rule list', async () => {
    const f = await fixture()
    await f.acquire()
    await f.adapter.closeSession?.('orca-session')
    f.launch.resumeSessionId = 'ses_fixture'
    const before = f.session?.permission
    f.launch.permissionRules.push({ permission: 'bash', pattern: 'network *', action: 'deny' })
    await f.acquire(2)
    const after = f.session?.permission
    expect(Array.isArray(after) && Array.isArray(before) && after.length > before.length).toBe(true)
    await f.adapter.closeSession?.('orca-session')
    await f.acquire(3)
    expect(f.session?.permission).toEqual(after)
    expect(f.request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1)
  })
  it('sends one stable provider message and never resends a lost acknowledgement', async () => {
    const f = await fixture()
    await f.acquire()
    f.route(async (method, path, body) => {
      if (path.endsWith('/prompt_async')) {
        throw new Error('lost ack')
      }
      return f.defaultRequest(method, path, body)
    })
    expect(await f.dispatch()).toMatchObject({ state: 'unknown' })
    expect(await f.dispatch()).toMatchObject({ state: 'unknown' })
    expect(f.request.mock.calls.filter(([, path]) => path.endsWith('/prompt_async'))).toHaveLength(
      1
    )
    const id = openCodeClientMessageId('orca-session', 'client-one', 1700000000000)
    f.emit('message.updated', { info: openCodeUser(id) })
    expect(f.onDispatchSettledLate).toHaveBeenCalledWith(
      expect.objectContaining({ clientMessageId: 'client-one' })
    )
    expect(await f.dispatch()).toMatchObject({ state: 'accepted' })
  })
  it('checks provider history before dispatch after restart and does not send an existing message', async () => {
    const f = await fixture()
    await f.acquire()
    const id = openCodeClientMessageId('orca-session', 'client-one', 1700000000000)
    f.route(async (method, path, body) =>
      path.endsWith(`/message/${id}`)
        ? { info: openCodeUser(id), parts: [openCodeText(id)] }
        : f.defaultRequest(method, path, body)
    )
    expect(await f.dispatch()).toMatchObject({
      state: 'accepted',
      providerIdentity: { messageId: id }
    })
    expect(f.request.mock.calls.some(([, path]) => path.endsWith('/prompt_async'))).toBe(false)
  })
  it('refuses attachments, slash commands and stale fences before any prompt write', async () => {
    const f = await fixture()
    await f.acquire()
    const send = (text: string) =>
      f.adapter.dispatch({
        sessionId: 'orca-session',
        clientMessageId: text,
        fence: 1,
        requestedAt: 100,
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] }
      })
    expect(await send('/compact')).toMatchObject({ state: 'rejected' })
    await expect(
      f.adapter.dispatch({
        sessionId: 'orca-session',
        clientMessageId: 'bad',
        fence: 2,
        body: { kind: 'message', role: 'user', blocks: [] }
      })
    ).rejects.toThrow('current provider owner')
    expect(
      await f.adapter.dispatch({
        sessionId: 'orca-session',
        clientMessageId: 'image',
        fence: 1,
        body: { kind: 'message', role: 'user', blocks: [{ type: 'image-ref', path: '/image' }] }
      })
    ).toMatchObject({ state: 'rejected' })
  })
  it('restores typed history and settles completed turns without a new model request', async () => {
    const f = await fixture()
    f.setHistory([
      { info: openCodeUser(), parts: [openCodeText()] },
      {
        info: {
          id: 'msg_answer',
          sessionID: 'ses_fixture',
          role: 'assistant',
          parentID: 'msg_user',
          time: { created: 101, completed: 102 },
          finish: 'stop'
        },
        parts: [openCodeText('msg_answer', 'Answer')]
      }
    ])
    await f.acquire()
    expect(f.rows).toContainEqual(
      expect.objectContaining({
        body: expect.objectContaining({ kind: 'turn', state: 'completed', outcome: 'success' })
      })
    )
    expect(f.rows).toContainEqual(
      expect.objectContaining({
        body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Answer' }] }
      })
    )
    expect(f.request.mock.calls.some(([, path]) => path.endsWith('/prompt_async'))).toBe(false)
  })
  it('serializes acquisition and retains unproven cleanup instead of opening a second child', async () => {
    const f = await fixture()
    await f.acquire()
    f.close.mockResolvedValue(false)
    await expect(f.acquire(2)).rejects.toThrow('exit_unproven')
    f.close.mockResolvedValue(true)
    expect(await f.adapter.closeSession?.('orca-session')).toBe(true)
  })
  it('closes the owned process after SSE loss and reports unexpected exit only after proof', async () => {
    const f = await fixture()
    await f.acquire()
    f.close.mockResolvedValue(false)
    f.lose()
    await vi.waitFor(() => expect(f.close).toHaveBeenCalled())
    expect(f.onEvent).not.toHaveBeenCalled()
    f.close.mockResolvedValue(true)
    expect(await f.adapter.forceCloseSession?.('orca-session')).toBe(true)
    expect(f.onEvent).toHaveBeenCalledWith(expect.objectContaining({ cause: 'unexpected-exit' }))
  })
  it('does not spawn when launch configuration is refused', async () => {
    const f = await fixture()
    const openConnection = vi.fn(f.deps.openConnection)
    const adapter = createOpenCodeStructuredSessionAdapter({
      ...f.deps,
      openConnection,
      resolveLaunch: async () => {
        throw new Error('native only')
      }
    })
    await expect(
      adapter.acquire({ identity: f.identity, fence: 1, spawnToken: 'token' })
    ).rejects.toThrow('native only')
    expect(openConnection).not.toHaveBeenCalled()
  })
})
