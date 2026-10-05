// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import { LocalWorkspaceLinearIssuePicker } from './LocalWorkspaceLinearIssuePicker'
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

async function renderPicker() {
  render(
    <LocalWorkspaceLinearIssuePicker
      links={[]}
      disabled={false}
      onAttach={() => {}}
      onSettings={() => {}}
    />
  )
  await act(async () => {})
  return screen.getByPlaceholderText('Search Linear issues…')
}
function expectSearchHint() {
  expect(
    screen.getByText('Enter at least two characters, an issue identifier, or a Linear URL.')
  ).toBeTruthy()
  expect(screen.queryAllByRole('option')).toHaveLength(0)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('Searching Linear…')).toBeNull()
  expect(screen.queryByText(/No issues returned/)).toBeNull()
}

describe('search-only Workspace Linear issue picker', () => {
  it.each(['', ' ', 'A', ' A '])('shows only the search hint for query %j', async (query) => {
    const input = await renderPicker()
    fireEvent.change(input, { target: { value: query } })
    await act(() => vi.advanceTimersByTimeAsync(300))
    expectSearchHint()
    expect(linearListIssues).not.toHaveBeenCalled()
    expect(linearSearchIssues).not.toHaveBeenCalled()
    expect(linearGetIssue).not.toHaveBeenCalled()
  })

  it('does not load issues when refreshing access before a search', async () => {
    await renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh issues' }))
    await act(() => vi.advanceTimersByTimeAsync(300))
    expectSearchHint()
    expect(linearStatus).toHaveBeenCalledTimes(2)
    expect(linearListIssues).not.toHaveBeenCalled()
    expect(linearSearchIssues).not.toHaveBeenCalled()
    expect(linearGetIssue).not.toHaveBeenCalled()
  })

  it('shows explicit search results and removes them immediately when cleared', async () => {
    const input = await renderPicker()
    fireEvent.change(input, { target: { value: 'APP' } })
    expect(screen.getByText('Searching Linear…')).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(screen.getByRole('option', { name: /APP-1.*Fix the application/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: '' } })
    expectSearchHint()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expectSearchHint()
    expect(linearSearchIssues).toHaveBeenCalledOnce()
    expect(linearListIssues).not.toHaveBeenCalled()
  })

  it('shows no-results feedback only after a qualifying search completes', async () => {
    vi.mocked(linearSearchIssues).mockResolvedValue([])
    const input = await renderPicker()
    expectSearchHint()
    fireEvent.change(input, { target: { value: 'absent' } })
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(screen.getByText(/No issues returned/)).toBeTruthy()
    fireEvent.change(input, { target: { value: 'a' } })
    expectSearchHint()
  })
})
