import type { AppState } from '@/store/types'
import { flushPendingEditorChange } from '@/components/editor/editor-pending-flush'
import { buildOwnedEditorFileId } from '@/store/slices/editor/file-ids/editor-file-ids'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import {
  filterLocalWorkspaceFileLayout,
  type LocalFileLayoutSnapshot
} from './local-workspace-file-layout'

export function flushLocalWorkspaceFileTabs(get: () => AppState, workspaceId: string): void {
  const key = folderWorkspaceKey(workspaceId)
  for (const file of get().openFiles.filter((entry) => entry.worktreeId === key)) {
    flushPendingEditorChange(file.id)
  }
}

export function applyLocalWorkspaceFileLayout(
  get: () => AppState,
  restoreSelection: (selection: Pick<AppState, 'activeFileId' | 'activeTabType'>) => void,
  snapshot: LocalFileLayoutSnapshot,
  destinationId: string
): { copied: number; skipped: number } {
  const state = get()
  const key = folderWorkspaceKey(destinationId)
  if (
    destinationId === snapshot.sourceWorkspaceId ||
    state.activeWorktreeId === key ||
    state.openFiles.some((file) => file.worktreeId === key) ||
    state.unifiedTabsByWorktree[key]?.length ||
    state.tabsByWorktree[key]?.length ||
    state.browserTabsByWorktree[key]?.length ||
    state.groupsByWorktree[key]?.length ||
    state.layoutByWorktree[key]
  ) {
    throw new Error(
      'Tabs can only be copied into a fresh, unopened Workspace. Existing tabs were not replaced.'
    )
  }
  const plan = filterLocalWorkspaceFileLayout(state, snapshot, destinationId)
  if (!plan.layout) {
    return { copied: 0, skipped: plan.skipped }
  }
  const selection = { activeFileId: state.activeFileId, activeTabType: state.activeTabType }
  const groupIds = new Map<string, string>()
  const tabIds = new Map<string, string>()
  let copied = 0
  const createGroups = (node: TabGroupLayoutNode, targetGroupId: string, nodePath: string) => {
    if (node.type === 'leaf') {
      groupIds.set(node.groupId, targetGroupId)
      return
    }
    const second = get().createEmptySplitGroup(
      key,
      targetGroupId,
      node.direction === 'horizontal' ? 'right' : 'down',
      { activate: false }
    )
    if (!second) {
      throw new Error('Could not create the copied file split.')
    }
    get().setTabGroupSplitRatio(key, nodePath, node.ratio ?? 0.5)
    createGroups(node.first, targetGroupId, nodePath ? `${nodePath}.first` : 'first')
    createGroups(node.second, second, nodePath ? `${nodePath}.second` : 'second')
  }
  try {
    createGroups(plan.layout, get().ensureWorktreeRootGroup(key), '')
    for (const group of plan.groups) {
      const targetGroupId = groupIds.get(group.id)
      if (!targetGroupId) {
        throw new Error('Copied file group is unavailable.')
      }
      for (const file of group.files) {
        const id = get().openFile(
          {
            worktreeId: key,
            filePath: file.filePath,
            relativePath: file.relativePath,
            language: file.language,
            mode: 'edit',
            runtimeEnvironmentId: null
          },
          {
            preview: false,
            targetGroupId,
            suppressActiveRuntimeFallback: true,
            reopenId: buildOwnedEditorFileId(file.filePath, key, null)
          }
        )
        const tab = get().findTabForEntityInGroup(key, targetGroupId, id, 'editor')
        if (!tab) {
          throw new Error('A copied file tab could not be opened.')
        }
        tabIds.set(file.sourceTabId, tab.id)
        copied += 1
      }
      const active = tabIds.get(group.activeTabId ?? '') ?? tabIds.get(group.files[0].sourceTabId)
      if (active) {
        get().activateTab(active, { worktreeId: key })
      }
    }
    const activeGroup = groupIds.get(plan.activeGroupId ?? '') ?? groupIds.values().next().value
    if (activeGroup) {
      get().focusGroup(key, activeGroup)
    }
    return { copied, skipped: plan.skipped }
  } catch (error) {
    throw new Error(
      `Copied ${copied} file tabs before copying stopped. Existing files and source tabs were not changed. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  } finally {
    // openFile also selects globally; retain the source until normal Workspace activation.
    restoreSelection(selection)
  }
}
