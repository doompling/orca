import type { AppState } from '@/store/types'
import type { OpenFile } from '@/store/slices/editor'
import type { Tab, TabGroupLayoutNode } from '../../../../shared/tab-types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { getLocalWorkspaceEditorRoot } from './local-workspace-editor-root'

type FileLayoutState = Pick<
  AppState,
  | 'localProjects'
  | 'openFiles'
  | 'editorDrafts'
  | 'unifiedTabsByWorktree'
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'activeGroupIdByWorktree'
  | 'activeOrcaProfileId'
>
export type LocalFileTabSnapshot = {
  sourceTabId: string
  sourceFileId: string
  filePath: string
  relativePath: string
  language: string
}
export type LocalFileLayoutSnapshot = {
  sourceWorkspaceId: string
  projectId: string
  profileId: string | null
  layout: TabGroupLayoutNode | null
  activeGroupId: string | null
  groups: { id: string; activeTabId: string | null; files: LocalFileTabSnapshot[] }[]
  skipped: number
}

function activeWorkspace(state: FileLayoutState, workspaceId: string, projectId: string): boolean {
  return (
    state.localProjects.projects.some(
      (project) => project.id === projectId && !project.isArchived
    ) &&
    state.localProjects.workspaces.some(
      (workspace) =>
        workspace.id === workspaceId && workspace.projectId === projectId && !workspace.isArchived
    )
  )
}

function cleanFile(state: FileLayoutState, tab: Tab, workspaceKey: string): OpenFile | null {
  const file = state.openFiles.find(
    (entry) => entry.id === tab.entityId && entry.worktreeId === workspaceKey
  )
  if (
    tab.contentType !== 'editor' ||
    tab.worktreeId !== workspaceKey ||
    tab.isPreview ||
    (tab.executionHostId && tab.executionHostId !== 'local') ||
    !file ||
    file.mode !== 'edit' ||
    file.isDirty ||
    file.id in state.editorDrafts ||
    file.isPreview ||
    file.isUntitled ||
    file.externalMutation ||
    file.readOnly ||
    file.liveTail ||
    file.runtimeEnvironmentId ||
    file.externalSshTargetId ||
    file.mirroredFromRuntimeSession ||
    file.markdownPreviewSourceFileId ||
    file.pendingOwnerMigration ||
    file.pendingDiskBaselineVerification ||
    file.pendingLiveDiskVerification ||
    file.pendingSelfMoveEcho ||
    (file.operationProvenance &&
      file.operationProvenance.generation.route.executionHostId !== 'local') ||
    !getLocalWorkspaceEditorRoot(state.localProjects, file)
  ) {
    return null
  }
  return file
}

export function pruneLocalFileLayout(
  layout: TabGroupLayoutNode | null,
  kept: ReadonlySet<string>
): TabGroupLayoutNode | null {
  if (!layout) {
    return null
  }
  if (layout.type === 'leaf') {
    return kept.has(layout.groupId) ? { type: 'leaf', groupId: layout.groupId } : null
  }
  const first = pruneLocalFileLayout(layout.first, kept)
  const second = pruneLocalFileLayout(layout.second, kept)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  return { type: 'split', direction: layout.direction, first, second, ratio: layout.ratio }
}

function layoutGroups(layout: TabGroupLayoutNode | null): string[] {
  if (!layout) {
    return []
  }
  return layout.type === 'leaf'
    ? [layout.groupId]
    : [...layoutGroups(layout.first), ...layoutGroups(layout.second)]
}

export function captureLocalWorkspaceFileLayout(
  state: FileLayoutState,
  sourceWorkspaceId: string,
  projectId: string
): LocalFileLayoutSnapshot {
  if (!activeWorkspace(state, sourceWorkspaceId, projectId)) {
    throw new Error('Choose an available source Workspace in this Project.')
  }
  const key = folderWorkspaceKey(sourceWorkspaceId)
  const tabs = state.unifiedTabsByWorktree[key] ?? []
  const visibleGroups = new Set(layoutGroups(state.layoutByWorktree[key] ?? null))
  const groups = (state.groupsByWorktree[key] ?? [])
    .filter((group) => visibleGroups.has(group.id))
    .map((group) => ({
      id: group.id,
      activeTabId: group.activeTabId,
      files: group.tabOrder.flatMap((id) => {
        const tab = tabs.find((entry) => entry.id === id && entry.groupId === group.id)
        const file = tab ? cleanFile(state, tab, key) : null
        return file
          ? [
              {
                sourceTabId: id,
                sourceFileId: file.id,
                filePath: file.filePath,
                relativePath: file.relativePath,
                language: file.language
              }
            ]
          : []
      })
    }))
    .filter((group) => group.files.length > 0)
  return {
    sourceWorkspaceId,
    projectId,
    profileId: state.activeOrcaProfileId,
    layout: pruneLocalFileLayout(
      state.layoutByWorktree[key] ?? null,
      new Set(groups.map((group) => group.id))
    ),
    activeGroupId: state.activeGroupIdByWorktree[key] ?? null,
    groups,
    skipped: Math.max(
      0,
      tabs.length - groups.reduce((count, group) => count + group.files.length, 0)
    )
  }
}

export function filterLocalWorkspaceFileLayout(
  state: FileLayoutState,
  snapshot: LocalFileLayoutSnapshot,
  destinationId: string
): LocalFileLayoutSnapshot {
  if (
    snapshot.profileId !== state.activeOrcaProfileId ||
    !activeWorkspace(state, destinationId, snapshot.projectId)
  ) {
    throw new Error('The destination Workspace or active profile changed before copying tabs.')
  }
  const current = captureLocalWorkspaceFileLayout(
    state,
    snapshot.sourceWorkspaceId,
    snapshot.projectId
  )
  const currentFiles = new Map(
    current.groups.flatMap((group) => group.files.map((file) => [file.sourceTabId, file] as const))
  )
  const destinationKey = folderWorkspaceKey(destinationId)
  const groups = snapshot.groups
    .map((group) => ({
      ...group,
      files: group.files.filter((file) => {
        const now = currentFiles.get(file.sourceTabId)
        return (
          now?.sourceFileId === file.sourceFileId &&
          now.filePath === file.filePath &&
          Boolean(
            getLocalWorkspaceEditorRoot(state.localProjects, {
              worktreeId: destinationKey,
              filePath: file.filePath
            })
          )
        )
      })
    }))
    .filter((group) => group.files.length > 0)
  const count = (items: typeof groups) =>
    items.reduce((total, group) => total + group.files.length, 0)
  return {
    ...snapshot,
    groups,
    layout: pruneLocalFileLayout(snapshot.layout, new Set(groups.map((group) => group.id))),
    skipped: snapshot.skipped + count(snapshot.groups) - count(groups)
  }
}
