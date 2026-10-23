import { toast } from 'sonner'
import { formatOptionalPrimaryShortcutLabel } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { getWorktreeVisitTimestamp } from '@/lib/worktree-visit-recency'
import { selectLiveAgentStatusEntriesForWorktree } from '@/components/sidebar/worktree-agent-row-selectors'
import { folderWorkspaceKey, parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { hasLocalProjectsApi } from './local-projects-availability'
import { isEditableTarget } from '@/lib/editable-target'
import {
  localWorkspacesByRecentVisit,
  nextFreeMarkSlot,
  pickLocalWorkspaceSuccessor
} from './local-sidebar-model'
import { translate } from '@/i18n/i18n'

const OPEN_LINEAR_ISSUES_EVENT = 'ether:local-workspace-linear-issues'
const OPEN_MARKS_LIST_EVENT = 'ether:local-workspace-marks-list'

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function findWorkspace(workspaceId: string) {
  return useAppStore.getState().localProjects.workspaces.find((entry) => entry.id === workspaceId)
}

/** The shared activation path also records visit recency and back/forward history. */
export function openLocalWorkspace(workspaceId: string): boolean {
  return (
    activateAndRevealWorkspace(folderWorkspaceKey(workspaceId), { executionHostId: 'local' }) !==
    false
  )
}

export function openPreviousLocalWorkspace(): boolean {
  const activeId = activeLocalWorkspaceId()
  const previous = localWorkspacesByRecentVisit(
    useAppStore.getState().localProjects,
    localWorkspaceVisitedAt
  ).find((workspace) => workspace.id !== activeId)
  return previous ? openLocalWorkspace(previous.id) : false
}

export function localWorkspaceVisitedAt(worktreeId: string): number | undefined {
  return getWorktreeVisitTimestamp(useAppStore.getState().lastVisitedAtByWorktreeId, {
    id: worktreeId,
    hostId: 'local'
  })
}

export async function setLocalWorkspaceMarkSlot(
  workspaceId: string,
  markSlot: number | null | 'next'
): Promise<boolean> {
  try {
    await useAppStore.getState().updateLocalWorkspace({ workspaceId, updates: { markSlot } })
    return true
  } catch (cause) {
    toast.error(
      translate(
        'auto.features.local.projects.local.workspace.sidebar.actions.2aa0c29acd',
        'Could not update the mark.'
      ),
      { description: errorMessage(cause) }
    )
    return false
  }
}

export async function toggleLocalWorkspaceMark(workspaceId: string): Promise<void> {
  const workspace = findWorkspace(workspaceId)
  if (!workspace || workspace.isArchived) {
    return
  }
  if (workspace.markSlot !== undefined) {
    if (await setLocalWorkspaceMarkSlot(workspaceId, null)) {
      toast(`Removed mark ${workspace.markSlot} from ${workspace.name}`)
    }
    return
  }
  if (nextFreeMarkSlot(useAppStore.getState().localProjects) === null) {
    toast('All 9 marks are in use', {
      description: translate(
        'auto.features.local.projects.local.workspace.sidebar.actions.ebf5728e24',
        'Clear one to mark this Workspace.'
      ),
      action: {
        label: translate(
          'auto.features.local.projects.local.workspace.sidebar.actions.09abc9000b',
          'Edit marks'
        ),
        onClick: requestLocalWorkspaceMarksList
      }
    })
    return
  }
  // Why 'next': main picks the slot in the same write, so two quick marks can't claim one slot.
  if (!(await setLocalWorkspaceMarkSlot(workspaceId, 'next'))) {
    return
  }
  const slot = findWorkspace(workspaceId)?.markSlot
  if (slot === undefined) {
    return
  }
  const keybindings = useAppStore.getState().keybindings
  const jump = formatOptionalPrimaryShortcutLabel('workspace.selectByIndex', keybindings)
  const edit = formatOptionalPrimaryShortcutLabel('workspace.showMarks', keybindings)
  toast(`Marked ${workspace.name} as ${slot}`, {
    description: [
      jump ? `${jump.replace(/1$/, String(slot))} opens it` : null,
      edit ? `${edit} edits marks` : null
    ]
      .filter(Boolean)
      .join(' · ')
  })
}

/** Archives without the old "switch away first" step: the previous Workspace opens, with Undo. */
export async function archiveLocalWorkspace(workspaceId: string): Promise<void> {
  const state = useAppStore.getState()
  const workspace = findWorkspace(workspaceId)
  if (!workspace || workspace.isArchived) {
    return
  }
  const worktreeId = folderWorkspaceKey(workspaceId)
  const wasActive = state.activeWorktreeId === worktreeId
  const previousMarkSlot = workspace.markSlot ?? null
  const runningAgents = selectLiveAgentStatusEntriesForWorktree(state, worktreeId).filter(
    (entry) => entry.state !== 'done'
  ).length
  if (wasActive) {
    const successor = pickLocalWorkspaceSuccessor(
      state.localProjects,
      workspaceId,
      localWorkspaceVisitedAt
    )
    if (!successor || !openLocalWorkspace(successor.id)) {
      state.setActiveWorktree(null)
    }
  }
  try {
    await state.updateLocalWorkspace({ workspaceId, updates: { isArchived: true } })
  } catch (cause) {
    toast.error(
      translate(
        'auto.features.local.projects.local.workspace.sidebar.actions.8fcd51cfec',
        'Could not archive {{value0}}.',
        { value0: workspace.name }
      ),
      { description: errorMessage(cause) }
    )
    return
  }
  toast(`Archived ${workspace.name}`, {
    description:
      runningAgents > 0
        ? `${runningAgents} agent${runningAgents === 1 ? ' is' : 's are'} still working or waiting.`
        : 'Files, tabs, and sessions are kept.',
    action: {
      label: translate(
        'auto.features.local.projects.local.workspace.sidebar.actions.b32bb4687c',
        'Undo'
      ),
      onClick: () => {
        void restoreLocalWorkspace(workspaceId, previousMarkSlot, wasActive)
      }
    }
  })
}

async function restoreLocalWorkspace(
  workspaceId: string,
  markSlot: number | null,
  reopen: boolean
): Promise<void> {
  try {
    await useAppStore.getState().updateLocalWorkspace({
      workspaceId,
      updates: { isArchived: false, ...(markSlot === null ? {} : { markSlot }) }
    })
    if (reopen) {
      openLocalWorkspace(workspaceId)
    }
  } catch (cause) {
    toast.error(
      translate(
        'auto.features.local.projects.local.workspace.sidebar.actions.a2ae908ca8',
        'Could not restore the Workspace.'
      ),
      { description: errorMessage(cause) }
    )
  }
}

function requestEvent(name: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function onRequestEvent(name: string, listener: (detail: string | undefined) => void) {
  const handle = (event: Event): void => {
    listener(
      event instanceof CustomEvent && typeof event.detail === 'string' ? event.detail : undefined
    )
  }
  window.addEventListener(name, handle)
  return () => window.removeEventListener(name, handle)
}

export function requestLocalWorkspaceLinearIssues(workspaceId: string): void {
  requestEvent(OPEN_LINEAR_ISSUES_EVENT, workspaceId)
}

export function onLocalWorkspaceLinearIssuesRequest(
  listener: (workspaceId: string) => void
): () => void {
  return onRequestEvent(OPEN_LINEAR_ISSUES_EVENT, (workspaceId) => {
    if (workspaceId) {
      listener(workspaceId)
    }
  })
}

export function requestLocalWorkspaceMarksList(): void {
  requestEvent(OPEN_MARKS_LIST_EVENT)
}

export function onLocalWorkspaceMarksListRequest(listener: () => void): () => void {
  return onRequestEvent(OPEN_MARKS_LIST_EVENT, () => listener())
}

/** The open local Workspace's id, or null when a git worktree or nothing is open. */
export function activeLocalWorkspaceId(): string | null {
  const state = useAppStore.getState()
  const scope = state.activeWorktreeId ? parseWorkspaceKey(state.activeWorktreeId) : null
  return scope?.type === 'folder' &&
    state.localProjects.workspaces.some((entry) => entry.id === scope.folderWorkspaceId)
    ? scope.folderWorkspaceId
    : null
}

/** The delete chord's local target, behind the same guards as upstream's hovered delete. */
export function localWorkspaceArchiveShortcutTarget(): string | null {
  if (!hasLocalProjectsApi()) {
    return null
  }
  const state = useAppStore.getState()
  const focused = document.activeElement
  if (
    state.activeModal !== 'none' ||
    state.activeView === 'settings' ||
    document.querySelector('[role="dialog"][data-state="open"]') !== null ||
    (focused !== null && isEditableTarget(focused))
  ) {
    return null
  }
  return activeLocalWorkspaceId()
}

/**
 * Local mode routes the delete chord to Archive (with Undo) for the open Workspace. Returns true
 * whenever a local Workspace is open, guarded or not, so upstream's hovered delete never runs on it.
 */
/** Claims `workspace.delete` to archive the open local Workspace; false when it is not the target. */
export function claimLocalWorkspaceArchive(
  claim: (actionId: 'workspace.delete', run: () => void) => boolean
): boolean {
  const workspaceId = localWorkspaceArchiveShortcutTarget()
  return (
    workspaceId !== null && claim('workspace.delete', () => void archiveLocalWorkspace(workspaceId))
  )
}

export function archiveActiveLocalWorkspaceFromShortcut(): boolean {
  const workspaceId = localWorkspaceArchiveShortcutTarget()
  if (workspaceId) {
    void archiveLocalWorkspace(workspaceId)
  }
  return hasLocalProjectsApi() && activeLocalWorkspaceId() !== null
}
