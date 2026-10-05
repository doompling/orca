import { beforeEach, describe, expect, it, vi } from 'vitest'
import { linearListIssues, linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import { linearGetIssue } from '@/runtime/runtime-linear-issue-mutations'
import {
  readLocalWorkspaceLinearIssues,
  readLocalWorkspaceLinkedIssue,
  requireLocalWorkspaceLinearAccount
} from './local-workspace-linear-issue-reads'
import {
  localLinearIssue,
  localLinearLink,
  localLinearStatus
} from './workspace-linear-picker-test-fixtures'

vi.mock('@/runtime/runtime-linear-client', () => ({
  linearListIssues: vi.fn(),
  linearSearchIssues: vi.fn(),
  linearStatus: vi.fn()
}))
vi.mock('@/runtime/runtime-linear-issue-mutations', () => ({ linearGetIssue: vi.fn() }))

function account() {
  const entry = localLinearStatus().workspaces?.[0]
  if (!entry) {
    throw new Error('Missing fixture account')
  }
  return entry
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(linearStatus).mockResolvedValue(localLinearStatus())
  vi.mocked(linearGetIssue).mockResolvedValue(localLinearIssue())
})

describe('Workspace Linear issue reads', () => {
  it.each(['', '  ', 'a', ' a '])(
    'does not fetch issue results for a short query %j',
    async (query) => {
      await expect(readLocalWorkspaceLinearIssues(account(), query)).resolves.toEqual({
        issues: [],
        error: null
      })
      expect(linearListIssues).not.toHaveBeenCalled()
      expect(linearSearchIssues).not.toHaveBeenCalled()
      expect(linearGetIssue).not.toHaveBeenCalled()
    }
  )

  it('looks up a normalized issue identifier directly in the selected account', async () => {
    await expect(readLocalWorkspaceLinearIssues(account(), ' app-1 ')).resolves.toEqual({
      issues: [localLinearIssue()],
      error: null
    })
    expect(linearGetIssue).toHaveBeenCalledExactlyOnceWith(
      { activeRuntimeEnvironmentId: null },
      'APP-1',
      'account'
    )
    expect(linearSearchIssues).not.toHaveBeenCalled()
  })

  it('resolves a pasted issue URL, checking its returned organization even when account metadata lacks a slug', async () => {
    await expect(
      readLocalWorkspaceLinearIssues(account(), localLinearIssue().url)
    ).resolves.toMatchObject({ issues: [{ id: 'issue' }] })
    vi.mocked(linearGetIssue).mockResolvedValueOnce({
      ...localLinearIssue(),
      url: 'https://linear.app/other/issue/APP-1/task'
    })
    await expect(readLocalWorkspaceLinearIssues(account(), localLinearIssue().url)).rejects.toThrow(
      'did not match'
    )
  })

  it('refuses another organization URL before reading and never uses title search for malformed URLs', async () => {
    await expect(
      readLocalWorkspaceLinearIssues(
        { ...account(), organizationUrlKey: 'other' },
        localLinearIssue().url
      )
    ).rejects.toThrow('another Linear account')
    await expect(
      readLocalWorkspaceLinearIssues(account(), 'https://example.com/issue/APP-1')
    ).rejects.toThrow('Paste a Linear issue URL')
    expect(linearGetIssue).not.toHaveBeenCalled()
    expect(linearSearchIssues).not.toHaveBeenCalled()
  })

  it('keeps ordinary title searches bounded and excludes another account response', async () => {
    vi.mocked(linearSearchIssues).mockResolvedValue([
      localLinearIssue(),
      localLinearIssue('other', 'another-account')
    ])
    await expect(readLocalWorkspaceLinearIssues(account(), 'application')).resolves.toEqual({
      issues: [localLinearIssue()],
      error: null
    })
    expect(linearSearchIssues).toHaveBeenCalledExactlyOnceWith(
      { activeRuntimeEnvironmentId: null },
      'application',
      20,
      'account'
    )
  })

  it('reports a rejected search instead of falling back to unrelated results', async () => {
    vi.mocked(linearSearchIssues).mockRejectedValue(new Error('Read failed'))
    await expect(readLocalWorkspaceLinearIssues(account(), 'application')).rejects.toThrow(
      'Read failed'
    )
    expect(linearListIssues).not.toHaveBeenCalled()
  })

  it('opens the saved UUID through its original account, not a stale identifier', async () => {
    await expect(
      readLocalWorkspaceLinkedIssue({ ...localLinearLink(), identifier: 'OLD-42' })
    ).resolves.toEqual(localLinearIssue())
    expect(linearGetIssue).toHaveBeenCalledExactlyOnceWith(
      { activeRuntimeEnvironmentId: null },
      'issue',
      'account'
    )
  })

  it('does not use a replaced or disconnected account to open or refresh saved details', async () => {
    vi.mocked(linearStatus).mockResolvedValue({
      ...localLinearStatus(),
      workspaces: [{ ...account(), organizationId: 'other' }]
    })
    await expect(requireLocalWorkspaceLinearAccount(localLinearLink())).rejects.toThrow(
      'original Linear account'
    )
    vi.mocked(linearStatus).mockResolvedValue({ connected: false, viewer: null })
    await expect(readLocalWorkspaceLinkedIssue(localLinearLink())).rejects.toThrow(
      'original Linear account'
    )
    expect(linearGetIssue).not.toHaveBeenCalled()
  })

  it.each([{ id: 'wrong-uuid' }, { workspaceId: 'wrong-account' }])(
    'refuses a mismatched linked issue response %j',
    async (patch) => {
      vi.mocked(linearGetIssue).mockResolvedValue({ ...localLinearIssue(), ...patch })
      await expect(readLocalWorkspaceLinkedIssue(localLinearLink())).rejects.toThrow(
        'original Linear account'
      )
    }
  )
})
