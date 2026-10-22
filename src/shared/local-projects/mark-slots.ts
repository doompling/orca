import type { LocalProjectsState, LocalWorkspace } from './types'

export const LOCAL_WORKSPACE_MARK_SLOTS = 9

export function isOpenableLocalWorkspace(
  state: LocalProjectsState,
  workspace: LocalWorkspace
): boolean {
  const project = state.projects.find((entry) => entry.id === workspace.projectId)
  return Boolean(project && !project.isArchived && !workspace.isArchived)
}

/** Slots held by hidden (archived) Workspaces count as free, so the user never sees a phantom "full". */
export function nextFreeLocalWorkspaceMarkSlot(state: LocalProjectsState): number | null {
  const used = new Set(
    state.workspaces
      .filter((workspace) => isOpenableLocalWorkspace(state, workspace))
      .map((workspace) => workspace.markSlot)
  )
  for (let slot = 1; slot <= LOCAL_WORKSPACE_MARK_SLOTS; slot++) {
    if (!used.has(slot)) {
      return slot
    }
  }
  return null
}

/**
 * Applies one mark request in a single write. Taking a held slot swaps its holder into the
 * requester's previous slot (or clears it), so reordering never drops a mark.
 */
export function applyLocalWorkspaceMarkSlot(
  state: LocalProjectsState,
  workspace: LocalWorkspace,
  requested: number | null | 'next' | undefined,
  archivedAfter: boolean
): { markSlot: number | undefined; displaced: Map<string, number | undefined> } {
  const displaced = new Map<string, number | undefined>()
  if (archivedAfter) {
    return { markSlot: undefined, displaced }
  }
  let markSlot: number | undefined
  if (requested === 'next') {
    markSlot = workspace.markSlot ?? nextFreeLocalWorkspaceMarkSlot(state) ?? undefined
    if (markSlot === undefined) {
      throw new Error(`All ${LOCAL_WORKSPACE_MARK_SLOTS} marks are in use.`)
    }
  } else {
    markSlot = requested === undefined ? workspace.markSlot : (requested ?? undefined)
  }
  if (markSlot !== undefined && markSlot !== workspace.markSlot) {
    for (const holder of state.workspaces) {
      if (holder.id !== workspace.id && holder.markSlot === markSlot) {
        displaced.set(holder.id, workspace.markSlot)
      }
    }
  }
  return { markSlot, displaced }
}
