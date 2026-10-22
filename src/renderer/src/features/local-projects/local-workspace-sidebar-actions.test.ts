// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectsState, LocalWorkspace } from '../../../../shared/local-projects/types'

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { error: vi.fn() })
  const activate = vi.fn((_id: string, _opts?: unknown): boolean | object => ({ ok: true }))
  const store: {
    localProjects: LocalProjectsState
    activeWorktreeId: string | null
    activeModal: string
    activeView: string
    lastVisitedAtByWorktreeId: Record<string, number>
    agentEntries: { state: string }[]
    updateLocalWorkspace: ReturnType<typeof vi.fn>
    setActiveWorktree: ReturnType<typeof vi.fn>
  } = {
    localProjects: { version: 1, projects: [], workspaces: [] },
    activeWorktreeId: null,
    activeModal: 'none',
    activeView: 'terminal',
    lastVisitedAtByWorktreeId: {},
    agentEntries: [],
    updateLocalWorkspace: vi.fn(async () => {}),
    setActiveWorktree: vi.fn()
  }
  return { toast, activate, store }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.store } }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: mocks.activate }))
vi.mock('@/components/sidebar/worktree-agent-row-selectors', () => ({
  selectLiveAgentStatusEntriesForWorktree: () => mocks.store.agentEntries
}))
vi.mock('./local-projects-availability', () => ({ hasLocalProjectsApi: () => true }))

import {
  archiveActiveLocalWorkspaceFromShortcut,
  archiveLocalWorkspace,
  toggleLocalWorkspaceMark
} from './local-workspace-sidebar-actions'

function workspace(id: string, extra: Partial<LocalWorkspace> = {}): LocalWorkspace {
  return {
    id,
    projectId: 'project',
    name: id,
    checkoutOverridesByRootId: {},
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

function seed(workspaces: LocalWorkspace[]): void {
  mocks.store.localProjects = {
    version: 1,
    projects: [
      {
        id: 'project',
        name: 'Project',
        roots: [{ id: 'root', label: 'root', path: '/root' }],
        defaultRootId: 'root',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    workspaces
  }
}

type ToastOptions = { description?: string; action?: { label: string; onClick: () => void } }
function lastToastOptions(): ToastOptions {
  const call = mocks.toast.mock.calls.at(-1)
  return (call?.[1] ?? {}) satisfies ToastOptions
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.store.activeModal = 'none'
  mocks.store.activeView = 'terminal'
  mocks.store.activeWorktreeId = 'folder:open'
  mocks.store.lastVisitedAtByWorktreeId = { 'local|folder:previous': 20 }
  mocks.store.agentEntries = []
  seed([workspace('open', { markSlot: 4 }), workspace('previous'), workspace('other')])
})

describe('archiveLocalWorkspace', () => {
  it('opens the previously visited Workspace before archiving the open one, then offers Undo', async () => {
    mocks.store.lastVisitedAtByWorktreeId = { 'folder:previous': 20 }
    mocks.store.agentEntries = [{ state: 'working' }, { state: 'done' }]
    await archiveLocalWorkspace('open')
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith('folder:previous', {
      executionHostId: 'local'
    })
    expect(mocks.store.updateLocalWorkspace).toHaveBeenCalledExactlyOnceWith({
      workspaceId: 'open',
      updates: { isArchived: true }
    })
    expect(mocks.toast).toHaveBeenLastCalledWith('Archived open', expect.anything())
    const options = lastToastOptions()
    expect(options.description).toBe('1 agent is still working or waiting.')
    options.action?.onClick()
    await vi.waitFor(() =>
      expect(mocks.store.updateLocalWorkspace).toHaveBeenLastCalledWith({
        workspaceId: 'open',
        updates: { isArchived: false, markSlot: 4 }
      })
    )
    expect(mocks.activate).toHaveBeenLastCalledWith('folder:open', { executionHostId: 'local' })
  })

  it('archives a background Workspace without switching', async () => {
    await archiveLocalWorkspace('other')
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(lastToastOptions().description).toBe('Files, tabs, and sessions are kept.')
  })

  it('clears the open Workspace when nothing else can open', async () => {
    seed([workspace('open')])
    await archiveLocalWorkspace('open')
    expect(mocks.store.setActiveWorktree).toHaveBeenCalledWith(null)
  })

  it('routes the delete chord to Archive only when a local Workspace is open', () => {
    expect(archiveActiveLocalWorkspaceFromShortcut()).toBe(true)
    expect(mocks.store.updateLocalWorkspace).toHaveBeenCalled()
    mocks.store.activeWorktreeId = 'repo::/worktree'
    expect(archiveActiveLocalWorkspaceFromShortcut()).toBe(false)
  })

  it('claims but ignores the delete chord behind a dialog, in Settings, or while typing', () => {
    mocks.store.activeModal = 'worktree-palette'
    expect(archiveActiveLocalWorkspaceFromShortcut()).toBe(true)
    mocks.store.activeModal = 'none'
    mocks.store.activeView = 'settings'
    expect(archiveActiveLocalWorkspaceFromShortcut()).toBe(true)
    mocks.store.activeView = 'terminal'
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(archiveActiveLocalWorkspaceFromShortcut()).toBe(true)
    input.remove()
    expect(mocks.store.updateLocalWorkspace).not.toHaveBeenCalled()
  })
})

describe('toggleLocalWorkspaceMark', () => {
  it('takes the first free slot, removes an existing mark, and reports a full set', async () => {
    seed([workspace('a', { markSlot: 1 }), workspace('b')])
    await toggleLocalWorkspaceMark('b')
    // Main resolves 'next' in the same write, so concurrent marks can't collide.
    expect(mocks.store.updateLocalWorkspace).toHaveBeenLastCalledWith({
      workspaceId: 'b',
      updates: { markSlot: 'next' }
    })
    await toggleLocalWorkspaceMark('a')
    expect(mocks.store.updateLocalWorkspace).toHaveBeenLastCalledWith({
      workspaceId: 'a',
      updates: { markSlot: null }
    })
    seed([
      ...Array.from({ length: 9 }, (_, index) => workspace(`m${index}`, { markSlot: index + 1 })),
      workspace('extra')
    ])
    mocks.store.updateLocalWorkspace.mockClear()
    await toggleLocalWorkspaceMark('extra')
    expect(mocks.store.updateLocalWorkspace).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenLastCalledWith('All 9 marks are in use', expect.anything())
  })
})
