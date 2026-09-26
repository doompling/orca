import { describe, expect, it, vi } from 'vitest'
import { attachParams, CALLER, hostTestState } from './structured-agent-session-host-test-harness'

describe('structured attach Workspace lock', () => {
  it('holds the Workspace shared lock before reserving and through provider acquisition', async () => {
    const { host, store, acquire } = hostTestState()
    let unlock!: () => void
    const waiting = new Promise<void>((resolve) => {
      unlock = resolve
    })
    const released = vi.fn()
    const scope = vi.fn(async () => {
      await waiting
      return released
    })
    host.deps.acquireWorkspaceScope = scope
    const params = attachParams()
    const attaching = host.attach(CALLER, params)
    await vi.waitFor(() => expect(scope).toHaveBeenCalledOnce())
    expect(store.getRecord(params.envelope.sessionId)).toBeNull()
    expect(acquire).not.toHaveBeenCalled()
    unlock()
    expect(await attaching).toMatchObject({ ok: true })
    expect(acquire).toHaveBeenCalledOnce()
    expect(released).toHaveBeenCalledOnce()
  })

  it('leaves no reservation or provider child when the scope admission refuses', async () => {
    const { host, store, acquire } = hostTestState()
    host.deps.acquireWorkspaceScope = async () => {
      throw new Error('roots changed')
    }
    const params = attachParams()
    await expect(host.attach(CALLER, params)).rejects.toThrow('roots changed')
    expect(store.getRecord(params.envelope.sessionId)).toBeNull()
    expect(acquire).not.toHaveBeenCalled()
  })

  it('releases the Workspace lock after ordinary attach refusal', async () => {
    const { host } = hostTestState()
    const release = vi.fn()
    host.deps.acquireWorkspaceScope = async () => release
    const params = attachParams()
    params.envelope.payloadFingerprint = 'a'.repeat(64)
    expect(await host.attach(CALLER, params)).toMatchObject({ ok: false })
    expect(release).toHaveBeenCalledOnce()
  })
})
