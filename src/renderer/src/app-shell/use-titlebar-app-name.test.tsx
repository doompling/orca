// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppIdentity } from '../../../shared/app-identity'
import { useTitlebarAppName } from './use-titlebar-app-name'

const identity: AppIdentity = {
  name: 'Ether',
  isDev: false,
  devLabel: null,
  devBranch: null,
  devWorktreeName: null,
  devRepoRoot: null,
  dockBadgeLabel: null
}
const getIdentity = vi.fn<() => Promise<AppIdentity>>()

beforeEach(() => {
  getIdentity.mockReset().mockResolvedValue(identity)
  vi.stubGlobal('api', { app: { getIdentity } })
  document.title = 'Orca'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useTitlebarAppName', () => {
  it('uses the packaged identity for the app label and document title', async () => {
    const { result } = renderHook(() => useTitlebarAppName())
    await waitFor(() => expect(result.current).toBe('Ether'))
    expect(document.title).toBe('Ether')
    expect(getIdentity).toHaveBeenCalledOnce()
  })

  it('keeps the upstream packaged name', async () => {
    getIdentity.mockResolvedValue({ ...identity, name: 'Orca' })
    const { result } = renderHook(() => useTitlebarAppName())
    await act(async () => {})
    expect(result.current).toBeNull()
    expect(document.title).toBe('Orca')
  })

  it('preserves the current development label and title fallback', async () => {
    getIdentity.mockResolvedValue({ ...identity, name: 'Orca: feature', isDev: true })
    const { result } = renderHook(() => useTitlebarAppName())
    await act(async () => {})
    expect(result.current).toBeNull()
    expect(document.title).toBe('Orca')
  })

  it('keeps the existing fallback when the bridge rejects', async () => {
    getIdentity.mockRejectedValue(new Error('Unavailable'))
    const { result } = renderHook(() => useTitlebarAppName())
    await act(async () => {})
    expect(result.current).toBeNull()
    expect(document.title).toBe('Orca')
  })

  it('keeps the existing fallback if no identity bridge is available', () => {
    vi.stubGlobal('api', undefined)
    const { result } = renderHook(() => useTitlebarAppName())
    expect(result.current).toBeNull()
    expect(document.title).toBe('Orca')
  })

  it('ignores an identity arriving after its titlebar unmounts', async () => {
    let finish: (value: AppIdentity) => void = () => {}
    getIdentity.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { unmount } = renderHook(() => useTitlebarAppName())
    unmount()
    await act(async () => finish(identity))
    expect(document.title).toBe('Orca')
  })
})
