import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import { createTestStore, issue } from './linear-slice-test-harness'

const { readIssue } = vi.hoisted(() => ({ readIssue: vi.fn() }))
vi.mock('@/runtime/runtime-linear-issue-mutations', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  linearGetIssue: readIssue
}))
vi.mock('../../hooks/useIssueMetadata', () => ({ clearLinearMetadataCache: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('explicit Linear issue cache ownership', () => {
  it.each(['local', 'runtime:remote'] as const)(
    'does not reuse unscoped data for %s',
    async (hostId) => {
      const store = createTestStore()
      const sourceContext: TaskSourceContext = {
        kind: 'task-source',
        provider: 'linear',
        projectId: 'tasks',
        hostId,
        providerIdentity: { provider: 'linear', workspaceId: 'account' }
      }
      const saved = { ...issue('uuid'), workspaceId: 'account', title: 'Confirmed source' }
      readIssue.mockResolvedValue(saved)
      store.setState({
        linearStatus: { connected: true, viewer: null, selectedWorkspaceId: 'account' },
        linearIssueCache: {
          uuid: { data: { ...saved, title: 'Unscoped other source' }, fetchedAt: Date.now() }
        }
      })
      await expect(
        store.getState().fetchLinearIssue('uuid', 'account', { sourceContext })
      ).resolves.toEqual(saved)
      await expect(
        store.getState().fetchLinearIssue('uuid', 'account', { sourceContext })
      ).resolves.toEqual(saved)
      expect(readIssue).toHaveBeenCalledExactlyOnceWith(sourceContext, 'uuid', 'account')
      expect(
        store.getState().linearIssueCache[
          `${getTaskSourceCacheScope(sourceContext)}::account::uuid`
        ]?.data
      ).toEqual(saved)
      expect(store.getState().linearIssueCache.uuid.data?.title).toBe('Unscoped other source')
    }
  )

  it('preserves the historical unscoped fallback for an unscoped read', async () => {
    const store = createTestStore()
    const saved = issue('legacy')
    store.setState({ linearIssueCache: { legacy: { data: saved, fetchedAt: Date.now() } } })
    await expect(store.getState().fetchLinearIssue('legacy')).resolves.toEqual(saved)
    expect(readIssue).not.toHaveBeenCalled()
  })
})
