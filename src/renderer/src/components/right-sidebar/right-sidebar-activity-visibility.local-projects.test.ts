import { describe, expect, it } from 'vitest'
import { Files } from 'lucide-react'
import type { ActivityBarItem } from './activity-bar-buttons'
import { getVisibleRightSidebarActivityItems } from './right-sidebar-activity-visibility'

describe('getVisibleRightSidebarActivityItems for local Workspaces', () => {
  it('offers selected-root Git for a local Workspace without enabling other Git-only panels', () => {
    const items: ActivityBarItem[] = [
      { id: 'explorer', icon: Files, title: 'Explorer', shortcut: '' },
      { id: 'source-control', icon: Files, title: 'Source Control', shortcut: '', gitOnly: true },
      { id: 'checks', icon: Files, title: 'Checks', shortcut: '', gitOnly: true }
    ]
    const visible = getVisibleRightSidebarActivityItems(items, {
      isFolder: true,
      isFolderWorkspace: true,
      hasSshHost: false,
      isLocalWorkspace: true
    })
    expect(visible.map((item) => item.id)).toEqual(['explorer', 'source-control'])
  })
})
