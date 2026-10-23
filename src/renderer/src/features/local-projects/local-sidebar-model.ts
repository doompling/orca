import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type {
  LocalProject,
  LocalProjectsState,
  LocalWorkspace
} from '../../../../shared/local-projects/types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import type { AgentRowState } from '../../../../shared/agent-row-decay-state'
import {
  LOCAL_WORKSPACE_MARK_SLOTS,
  nextFreeLocalWorkspaceMarkSlot
} from '../../../../shared/local-projects/mark-slots'

export type LocalSidebarRow = {
  project: LocalProject
  workspace: LocalWorkspace
  worktreeId: string
  activityAt: number
  isUnread: boolean
}

export type LocalSidebarModel = {
  marks: LocalSidebarRow[]
  projects: { project: LocalProject; rows: LocalSidebarRow[] }[]
}

type LiveFolderFields = Pick<FolderWorkspace, 'id' | 'isUnread' | 'lastActivityAt'>

function isOpenable(project: LocalProject | undefined, workspace: LocalWorkspace): boolean {
  return Boolean(project && !project.isArchived && !workspace.isArchived)
}

function compareByRecency(a: LocalSidebarRow, b: LocalSidebarRow): number {
  return (
    Number(a.workspace.isArchived) - Number(b.workspace.isArchived) ||
    b.activityAt - a.activityAt ||
    a.workspace.name.localeCompare(b.workspace.name)
  )
}

/** Live unread/activity land on the folder projection first; the catalog copy lags until refetch. */
export function buildLocalSidebarModel(
  catalog: LocalProjectsState,
  folderWorkspaces: readonly LiveFolderFields[],
  options: { showArchived: boolean }
): LocalSidebarModel {
  const live = new Map(folderWorkspaces.map((entry) => [entry.id, entry]))
  const projectsById = new Map(catalog.projects.map((project) => [project.id, project]))
  const rows: LocalSidebarRow[] = []
  for (const workspace of catalog.workspaces) {
    const project = projectsById.get(workspace.projectId)
    if (!project) {
      continue
    }
    const folder = live.get(workspace.id)
    rows.push({
      project,
      workspace,
      worktreeId: folderWorkspaceKey(workspace.id),
      activityAt: Math.max(
        workspace.createdAt,
        workspace.lastActivityAt ?? 0,
        folder?.lastActivityAt ?? 0
      ),
      isUnread: folder?.isUnread ?? workspace.isUnread ?? false
    })
  }
  const isMarked = (row: LocalSidebarRow) =>
    row.workspace.markSlot !== undefined && isOpenable(row.project, row.workspace)
  return {
    marks: rows
      .filter(isMarked)
      .sort((a, b) => (a.workspace.markSlot ?? 0) - (b.workspace.markSlot ?? 0)),
    projects: catalog.projects
      .filter((project) => options.showArchived || !project.isArchived)
      .map((project) => ({
        project,
        rows: rows
          .filter(
            (row) =>
              row.project.id === project.id &&
              !isMarked(row) &&
              (options.showArchived || !row.workspace.isArchived)
          )
          .sort(compareByRecency)
      }))
  }
}

/** Keeps rows where they were while the pointer is in the list, so a row never jumps out from under a click. */
export function holdRowOrder<T extends { worktreeId: string }>(
  rows: readonly T[],
  heldOrder: readonly string[] | undefined
): T[] {
  if (!heldOrder) {
    return [...rows]
  }
  const rank = new Map(heldOrder.map((id, index) => [id, index]))
  return [...rows].sort(
    (a, b) =>
      (rank.get(a.worktreeId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.worktreeId) ?? Number.MAX_SAFE_INTEGER)
  )
}

export { nextFreeLocalWorkspaceMarkSlot as nextFreeMarkSlot }

export type LocalWorkspaceMarkSlot = { slot: number; workspace: LocalWorkspace | null }

/** All nine slots in order, empty ones included, so a slot's digit never shifts. */
export function localWorkspaceMarkSlots(catalog: LocalProjectsState): LocalWorkspaceMarkSlot[] {
  return Array.from({ length: LOCAL_WORKSPACE_MARK_SLOTS }, (_, index) => {
    const workspace = catalog.workspaces.find(
      (entry) =>
        entry.markSlot === index + 1 &&
        isOpenable(
          catalog.projects.find((project) => project.id === entry.projectId),
          entry
        )
    )
    return { slot: index + 1, workspace: workspace ?? null }
  })
}

/** Open Workspaces by last visit, then by creation for ones never visited. */
export function localWorkspacesByRecentVisit(
  catalog: LocalProjectsState,
  visitedAt: (worktreeId: string) => number | undefined
): LocalWorkspace[] {
  return catalog.workspaces
    .filter((workspace) =>
      isOpenable(
        catalog.projects.find((entry) => entry.id === workspace.projectId),
        workspace
      )
    )
    .map((workspace) => ({
      workspace,
      visited: visitedAt(folderWorkspaceKey(workspace.id)) ?? -1
    }))
    .sort((a, b) => b.visited - a.visited || b.workspace.createdAt - a.workspace.createdAt)
    .map(({ workspace }) => workspace)
}

/** Where to go after archiving the open Workspace: the last one visited, else a sibling. */
export function pickLocalWorkspaceSuccessor(
  catalog: LocalProjectsState,
  archivedWorkspaceId: string,
  visitedAt: (worktreeId: string) => number | undefined
): LocalWorkspace | null {
  const archived = catalog.workspaces.find((entry) => entry.id === archivedWorkspaceId)
  const candidates = localWorkspacesByRecentVisit(catalog, visitedAt).filter(
    (workspace) => workspace.id !== archivedWorkspaceId
  )
  const visited = candidates.find(
    (workspace) => visitedAt(folderWorkspaceKey(workspace.id)) !== undefined
  )
  return (
    visited ??
    candidates.find((workspace) => workspace.projectId === archived?.projectId) ??
    candidates[0] ??
    null
  )
}

type AgentRowLike = { state: AgentRowState }

/** Idle and already-seen agents fold into a count; the open Workspace shows everything. */
export function partitionLocalSidebarAgents<T extends AgentRowLike>(
  agents: readonly T[],
  options: { isActive: boolean; isUnread: boolean }
): { shown: T[]; hiddenCount: number } {
  if (options.isActive) {
    return { shown: [...agents], hiddenCount: 0 }
  }
  const shown = agents.filter(
    (agent) =>
      agent.state === 'working' ||
      agent.state === 'blocked' ||
      agent.state === 'waiting' ||
      agent.state === 'unverifiable' ||
      (agent.state === 'done' && options.isUnread)
  )
  return { shown, hiddenCount: agents.length - shown.length }
}

/** formatShortTimeAgo plus weeks, so long-idle rows don't read as "45d". */
export function formatLocalSidebarAge(timestamp: number, now: number): string {
  const days = Math.floor((now - timestamp) / 86_400_000)
  return days >= 7 ? `${Math.floor(days / 7)}w` : formatShortTimeAgo(timestamp, now)
}

export function checkoutOverrideLabel(path: string): string {
  const segments = path.split(/[\\/]/)
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index]) {
      return segments[index]
    }
  }
  return path
}
