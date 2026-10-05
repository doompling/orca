// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import { useLocalWorkspaceLinearSearch } from './use-local-workspace-linear-search'
import { localLinearIssue, localLinearStatus } from './workspace-linear-picker-test-fixtures'

vi.mock('@/runtime/runtime-linear-client', () => ({
  linearStatus: vi.fn(),
  linearSearchIssues: vi.fn(),
  linearListIssues: vi.fn()
}))
vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({ linearGetIssue: vi.fn() }))
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
  it.each(['', '  ', 'a', ' a '])(
    'does not read issues for an unsearched query %j',
    async (query) => {
      const { result } = await setup()
      act(() => result.current.setQuery(query))
      await act(() => vi.advanceTimersByTimeAsync(300))
      act(() => result.current.refresh())
      await act(() => vi.advanceTimersByTimeAsync(300))
      expect(result.current.issues).toEqual([])
      expect(result.current.searching).toBe(false)
      expect(result.current.searchError).toBeNull()
      expect(linearListIssues).not.toHaveBeenCalled()
      expect(linearSearchIssues).not.toHaveBeenCalled()
      expect(linearGetIssue).not.toHaveBeenCalled()
    }
  )

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

  it('clears completed results and cancels a pending search when the query is cleared', async () => {
    const { result } = await setup()
    act(() => result.current.setQuery('APP'))
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current.issues).toEqual([localLinearIssue()])
    act(() => result.current.setQuery('new'))
    act(() => result.current.setQuery(''))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(result.current.issues).toEqual([])
    expect(result.current.searching).toBe(false)
    expect(result.current.searchError).toBeNull()
    expect(linearSearchIssues).toHaveBeenCalledOnce()
    expect(linearListIssues).not.toHaveBeenCalled()
    expect(linearGetIssue).not.toHaveBeenCalled()
  })

  it.each(['result', 'error'])(
    'ignores a late %s after clearing an in-flight search',
    async (outcome) => {
      let completeRequest = () => {}
      vi.mocked(linearSearchIssues).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            completeRequest = () => {
              if (outcome === 'result') {
                resolve([localLinearIssue()])
              } else {
                reject(new Error('Late request failure'))
              }
            }
          })
      )
      const { result } = await setup()
      act(() => result.current.setQuery('APP'))
      await act(() => vi.advanceTimersByTimeAsync(250))
      expect(result.current.searching).toBe(true)
      act(() => result.current.setQuery(' '))
      await act(async () => completeRequest())
      expect(result.current.issues).toEqual([])
      expect(result.current.searching).toBe(false)
      expect(result.current.searchError).toBeNull()
    }
  )

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

  it('clears an existing search failure when the query is shortened', async () => {
    vi.mocked(linearSearchIssues).mockRejectedValueOnce(new Error('Network unavailable'))
    const { result } = await setup()
    act(() => result.current.setQuery('APP'))
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(result.current.searchError).toBe('Network unavailable')
    act(() => result.current.setQuery('A'))
    expect(result.current.searchError).toBeNull()
    expect(result.current.issues).toEqual([])
    expect(result.current.searching).toBe(false)
  })
})
