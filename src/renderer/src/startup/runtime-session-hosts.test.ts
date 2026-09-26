import { afterEach, describe, expect, it, vi } from 'vitest'
import { listRuntimeSessionHostIdsForStartup } from './runtime-session-hosts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('listRuntimeSessionHostIdsForStartup', () => {
  it('maps saved environment ids to runtime session hosts', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'first' }, { id: 'second/host' }])
    vi.stubGlobal('window', { api: { runtimeEnvironments: { list } } })

    await expect(listRuntimeSessionHostIdsForStartup()).resolves.toEqual([
      'runtime:first',
      'runtime:second%2Fhost'
    ])
    expect(list).toHaveBeenCalledOnce()
  })

  it('keeps local startup available if the saved environment list cannot be read', async () => {
    const error = new Error('Environment list unavailable')
    const list = vi.fn().mockRejectedValue(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('window', { api: { runtimeEnvironments: { list } } })

    await expect(listRuntimeSessionHostIdsForStartup()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith('Failed to list runtime session hosts for startup:', error)
  })
})
