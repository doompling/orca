import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState } from '../../../shared/local-projects/types'

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  createEmptySplitGroup: vi.fn(),
  getKnownWorktreeById: vi.fn()
}))
const localProjects: LocalProjectsState = {
  version: 1,
  projects: [
    {
      id: 'p',
      name: 'Application',
      roots: [
        { id: 'a', label: 'A', path: '/app-a' },
        { id: 'b', label: 'B', path: '/app-b' }
      ],
      defaultRootId: 'b',
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  workspaces: [
    {
      id: 'w',
      projectId: 'p',
      name: 'Main',
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: 1,
      updatedAt: 1
    }
  ]
}
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ localProjects, ...mocks }), subscribe: vi.fn() }
}))

describe('unsupported local Workspace renderer launch paths', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects automation before trust, PTY reservation, or tab creation', async () => {
    const { launchAgentBackgroundSession } = await import('./launch-agent-background-session')
    await expect(
      launchAgentBackgroundSession({
        agent: 'codex',
        worktreeId: 'folder:w',
        prompt: 'hello',
        title: 'Automation'
      })
    ).rejects.toThrow('New tab → Codex or Claude')
    expect(mocks.getKnownWorktreeById).not.toHaveBeenCalled()
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('rejects AI Vault resume before splitting or creating an unscoped tab', async () => {
    const { launchAiVaultSessionInNewTab } = await import('./launch-ai-vault-session')
    expect(() =>
      launchAiVaultSessionInNewTab({
        agent: 'claude',
        worktreeId: 'folder:w',
        command: 'claude --resume saved',
        targetGroupId: 'group',
        splitDirection: 'right'
      })
    ).toThrow('Resume saved Workspace sessions from their existing tabs')
    expect(mocks.createTab).not.toHaveBeenCalled()
    expect(mocks.createEmptySplitGroup).not.toHaveBeenCalled()
  })
})
