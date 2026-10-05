import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchIssues } from './linear-issue-lookups'

const { rawRequest, getClients, clearToken } = vi.hoisted(() => ({
  rawRequest: vi.fn(),
  getClients: vi.fn(),
  clearToken: vi.fn()
}))

vi.mock('./linear-request-concurrency', () => ({
  acquire: vi.fn().mockResolvedValue(undefined),
  release: vi.fn()
}))
vi.mock('./linear-token-store', () => ({ clearToken }))
vi.mock('./client', () => ({ getClients, isAuthError: () => false }))

function makeEntry(workspaceId = 'workspace-1', request = rawRequest) {
  return {
    workspace: {
      id: workspaceId,
      organizationId: workspaceId,
      organizationName: 'Workspace',
      displayName: 'Ada',
      email: 'ada@example.com'
    },
    client: { client: { rawRequest: request } }
  }
}

describe('Linear issue search failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClients.mockReturnValue([makeEntry()])
  })

  it('surfaces search failures for a specific account instead of returning no matches', async () => {
    rawRequest.mockRejectedValueOnce(new Error('Linear search is temporarily unavailable'))

    await expect(searchIssues('recovery', 20, 'workspace-1')).rejects.toThrow(
      'Linear search is temporarily unavailable'
    )
    expect(clearToken).not.toHaveBeenCalled()
  })

  it('retains healthy search results when another account fails in an all-account search', async () => {
    const failed = vi.fn().mockRejectedValueOnce(new Error('Search unavailable'))
    getClients.mockReturnValue([makeEntry('workspace-1', failed), makeEntry('workspace-2')])
    rawRequest.mockResolvedValueOnce({
      data: {
        searchIssues: {
          nodes: [
            {
              id: 'issue-1',
              identifier: 'ENG-1',
              title: 'Recover search',
              url: 'https://linear.app/fixture/issue/ENG-1',
              priority: 2,
              updatedAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      }
    })

    await expect(searchIssues('recovery', 20, 'all')).resolves.toMatchObject([
      { identifier: 'ENG-1', workspaceId: 'workspace-2' }
    ])
    expect(clearToken).not.toHaveBeenCalled()
  })
})
