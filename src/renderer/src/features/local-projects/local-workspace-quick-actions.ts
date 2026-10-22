import { Archive, Bookmark, History, Link2, ListOrdered } from 'lucide-react'
import type { CmdJQuickAction } from '@/components/cmd-j/quick-actions'
import type { CmdJQuickActionAvailability } from '@/components/cmd-j/quick-action-context'
import { hasLocalProjectsApi } from './local-projects-availability'
import {
  activeLocalWorkspaceId,
  archiveLocalWorkspace,
  openPreviousLocalWorkspace,
  requestLocalWorkspaceLinearIssues,
  requestLocalWorkspaceMarksList,
  toggleLocalWorkspaceMark
} from './local-workspace-sidebar-actions'

function availability(): CmdJQuickActionAvailability {
  return activeLocalWorkspaceId()
    ? { available: true }
    : { available: false, reason: 'no-active-workspace' }
}

function onOpenWorkspace(run: (workspaceId: string) => void): CmdJQuickAction['run'] {
  return async () => {
    const workspaceId = activeLocalWorkspaceId()
    if (!workspaceId) {
      return { status: 'unavailable', reason: 'no-active-workspace' }
    }
    run(workspaceId)
    return { status: 'ok' }
  }
}

/** Ether fork: local Workspace verbs that left the sidebar rows for the palette. */
export function getLocalWorkspaceQuickActions(): CmdJQuickAction[] {
  if (!hasLocalProjectsApi()) {
    return []
  }
  return [
    {
      id: 'local-workspace-linear-issues',
      kind: 'action',
      title: 'Linear Issues…',
      description: 'Link, open, or unlink Linear issues for this Workspace.',
      icon: Link2,
      verbKeywords: ['linear', 'link issue', 'link linear issue', 'ticket', 'attach issue'],
      isAvailable: availability,
      run: onOpenWorkspace(requestLocalWorkspaceLinearIssues)
    },
    {
      id: 'local-workspace-toggle-mark',
      kind: 'action',
      title: 'Mark or Unmark Workspace',
      description: 'Add this Workspace to the next free mark slot, or remove its mark.',
      icon: Bookmark,
      verbKeywords: ['mark', 'unmark', 'bookmark', 'harpoon', 'pin workspace'],
      isAvailable: availability,
      run: onOpenWorkspace((workspaceId) => void toggleLocalWorkspaceMark(workspaceId))
    },
    {
      id: 'local-workspace-marks',
      kind: 'action',
      title: 'Edit Workspace Marks…',
      description: 'Reorder, assign, or clear mark slots 1–9.',
      icon: ListOrdered,
      verbKeywords: ['marks', 'bookmarks', 'harpoon', 'reorder marks'],
      isAvailable: () => ({ available: true }),
      run: async () => {
        requestLocalWorkspaceMarksList()
        return { status: 'ok' }
      }
    },
    {
      id: 'local-workspace-previous',
      kind: 'action',
      title: 'Previous Workspace',
      description:
        'Return to the Workspace you used before this one. Hold Ctrl and press ` to go further back.',
      icon: History,
      verbKeywords: ['previous workspace', 'last workspace', 'recent', 'back', 'toggle workspace'],
      isAvailable: () => ({ available: true }),
      run: async () => {
        openPreviousLocalWorkspace()
        return { status: 'ok' }
      }
    },
    {
      id: 'local-workspace-archive',
      kind: 'action',
      title: 'Archive Workspace',
      description:
        'Archive this Workspace and open the previous one. Files, tabs, and sessions are kept.',
      icon: Archive,
      verbKeywords: ['archive', 'archive workspace', 'close workspace', 'hide workspace'],
      isAvailable: availability,
      run: onOpenWorkspace((workspaceId) => void archiveLocalWorkspace(workspaceId))
    }
  ]
}
