// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import { linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { useLocalWorkspaceLinearSearch } from './use-local-workspace-linear-search'
import { localLinearIssue, localLinearStatus } from './workspace-linear-picker-test-fixtures'

vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(),
  linearSearchIssues: vi.fn()
}))
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(linearStatus).mockResolvedValue(localLinearStatus())
  vi.mocked(linearSearchIssues).mockResolvedValue([localLinearIssue()])
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetAllMocks()
})

async function setup() {
  const hook = renderHook(() => useLocalWorkspaceLinearSearch())
  await act(async () => {})
  return hook
}

describe('local Workspace Linear search', () => {
  it('pins every read to local access and a concrete account', async () => {
    const { result } = await setup()
    expect(linearStatus).toHaveBeenCalledWith({ activeRuntimeEnvironmentId: null })
    expect(result.current.accountId).toBe('account')
    act(() => result.current.setQuery('APP'))
    expect(result.current.searching).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(linearSearchIssues).toHaveBeenCalledExactlyOnceWith(
      { activeRuntimeEnvironmentId: null },
      'APP',
      20,
      'account'
    )
    expect(result.current.issues).toEqual([localLinearIssue()])
  })

  it('requires account selection when multiple local accounts exist', async () => {
    const status = localLinearStatus()
    status.workspaces?.push({
      id: 'other',
      organizationId: 'org-other',
      organizationName: 'Other',
      displayName: 'Member',
      email: null
    })
    vi.mocked(linearStatus).mockResolvedValue(status)
    const { result } = await setup()
    act(() => result.current.setQuery('APP'))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(result.current.accountId).toBe('')
    expect(linearSearchIssues).not.toHaveBeenCalled()
    act(() => result.current.setAccountId('other'))
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(linearSearchIssues).toHaveBeenCalledWith(
      { activeRuntimeEnvironmentId: null },
      'APP',
      20,
      'other'
    )
    expect(result.current.issues).toEqual([])
  })

  it('hides old results immediately and ignores late results for a previous query', async () => {
    let resolveOld: (issues: LinearIssue[]) => void = () => {}
    vi.mocked(linearSearchIssues).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        })
    )
    const { result } = await setup()
    act(() => result.current.setQuery('old'))
    await act(() => vi.advanceTimersByTimeAsync(250))
    act(() => result.current.setQuery('new'))
    expect(result.current.issues).toEqual([])
    await act(() => vi.advanceTimersByTimeAsync(250))
    await act(async () => resolveOld([localLinearIssue('old')]))
    expect(result.current.issues.map((issue) => issue.id)).toEqual(['issue'])
  })

  it('does not search with disconnected or undecryptable access', async () => {
    vi.mocked(linearStatus).mockResolvedValue({
      ...localLinearStatus(),
      credentialError: 'Access unavailable'
    })
    const { result } = await setup()
    act(() => result.current.setQuery('APP'))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(result.current.accounts).toEqual([])
    expect(result.current.statusError).toBe('Access unavailable')
    expect(linearSearchIssues).not.toHaveBeenCalled()
  })

  it('reports rejected search reads and clears them on retry', async () => {
    vi.mocked(linearSearchIssues).mockRejectedValueOnce(new Error('Network unavailable'))
    const { result } = await setup()
    act(() => result.current.setQuery('APP'))
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current.searchError).toBe('Network unavailable')
    act(() => result.current.refresh())
    await act(async () => {})
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current.searchError).toBeNull()
    expect(result.current.issues).toHaveLength(1)
  })
})
