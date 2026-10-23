// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { state, openTaskPage: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))
vi.mock('@/store/selectors', () => ({ useRepoMap: () => new Map() }))
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: () => null,
  ContextMenuItem: () => null
}))

import { SidebarTaskNavButton } from './SidebarTaskNavButton'

const folderRepo: Repo = {
  id: 'folder-1',
  path: '/tmp/folder-1',
  displayName: 'folder-1',
  badgeColor: 'gray',
  addedAt: 1,
  kind: 'folder'
}

function renderButton(settings: GlobalSettings = getDefaultSettings('/tmp')): void {
  mocks.state = {
    settings,
    repos: [folderRepo],
    activeView: 'worktrees',
    openTaskPage: mocks.openTaskPage,
    updateSettings: vi.fn(),
    preflightStatus: { glab: { installed: false } },
    preflightStatusChecked: true,
    refreshPreflightStatus: vi.fn(),
    linearStatus: { connected: false },
    linearStatusChecked: true,
    checkLinearConnection: vi.fn(),
    prefetchWorkItems: vi.fn(),
    activeRepoId: null
  }
  render(<SidebarTaskNavButton />)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Linear in the sidebar Tasks shortcuts', () => {
  it('offers Linear setup before connection, including folder Projects', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Open Linear tasks' }))
    expect(mocks.openTaskPage).toHaveBeenCalledWith({ taskSource: 'linear' })
  })

  it('respects an explicit choice to hide Linear from Tasks', () => {
    renderButton({ ...getDefaultSettings('/tmp'), visibleTaskProviders: ['github'] })
    expect(screen.queryByRole('button', { name: 'Open Linear tasks' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open GitHub tasks' })).toBeTruthy()
  })
})
