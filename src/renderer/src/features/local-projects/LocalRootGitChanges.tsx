import { useState } from 'react'
import { File, Minus, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { ActionButton } from '@/components/right-sidebar/source-control/listing/action-button'
import { SectionHeader } from '@/components/right-sidebar/source-control/listing/section-header'
import { DiffLineCounts } from '@/components/right-sidebar/source-control/listing/diff-line-counts'
import {
  canStageStatusEntry,
  canUnstageStatusEntry
} from '@/components/right-sidebar/source-control/listing/entry-actions'
import { STATUS_COLORS, STATUS_LABELS } from '@/components/right-sidebar/status-display'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'

export function LocalRootGitChanges({
  workspaceId,
  root,
  entries,
  busy,
  stage,
  unstage
}: {
  workspaceId: string
  root: LocalProjectRoot
  entries: GitStatusEntry[]
  busy: boolean
  stage: (path: string) => Promise<boolean>
  unstage: (path: string) => Promise<boolean>
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const open = (entry: GitStatusEntry, edit = false) => {
    if (entry.conflictStatus === 'unresolved' || entry.submodule) {
      return
    }
    const state = useAppStore.getState()
    const key = `folder:${workspaceId}`
    const absolutePath = joinPath(root.path, entry.path)
    if (edit || entry.area === 'untracked') {
      state.openFile(
        {
          filePath: absolutePath,
          relativePath: entry.path,
          worktreeId: key,
          language: detectLanguage(entry.path),
          mode: 'edit',
          runtimeEnvironmentId: null
        },
        {
          suppressActiveRuntimeFallback: true,
          focusEditor: true
        }
      )
    } else {
      state.openDiff(
        key,
        absolutePath,
        entry.path,
        detectLanguage(entry.path),
        entry.area === 'staged',
        {
          runtimeEnvironmentId: null,
          localRoot: { workspaceId, rootId: root.id }
        }
      )
    }
  }
  return (
    <>
      {(['staged', 'unstaged', 'untracked'] as const).map((area) => {
        const rows = entries.filter((entry) => entry.area === area)
        if (!rows.length) {
          return null
        }
        return (
          <section key={area}>
            <SectionHeader
              label={
                area === 'staged'
                  ? 'Staged changes'
                  : area === 'unstaged'
                    ? 'Changes'
                    : 'Untracked files'
              }
              count={rows.length}
              isCollapsed={Boolean(collapsed[area])}
              onToggle={() => setCollapsed((value) => ({ ...value, [area]: !value[area] }))}
            />
            {!collapsed[area] &&
              rows.map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-1 px-3 py-1 text-xs"
                  data-source-control-path={entry.path}
                  data-source-control-area={area}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:bg-accent"
                    disabled={entry.conflictStatus === 'unresolved' || Boolean(entry.submodule)}
                    onClick={() => open(entry)}
                  >
                    {entry.path}
                    {entry.conflictStatus === 'unresolved'
                      ? ' (conflict)'
                      : entry.submodule
                        ? ' (submodule)'
                        : ''}
                  </button>
                  <DiffLineCounts added={entry.added} removed={entry.removed} />
                  <span style={{ color: STATUS_COLORS[entry.status] }}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                  {entry.status !== 'deleted' &&
                    !entry.submodule &&
                    entry.conflictStatus !== 'unresolved' && (
                      <ActionButton
                        icon={File}
                        title={`Open ${entry.path}`}
                        onClick={() => open(entry, true)}
                      />
                    )}
                  {canStageStatusEntry(entry) && (
                    <ActionButton
                      icon={Plus}
                      title={`Stage ${entry.path}`}
                      disabled={busy}
                      onClick={() => {
                        void stage(entry.path)
                      }}
                    />
                  )}
                  {canUnstageStatusEntry(entry) && (
                    <ActionButton
                      icon={Minus}
                      title={`Unstage ${entry.path}`}
                      disabled={busy}
                      onClick={() => {
                        void unstage(entry.path)
                      }}
                    />
                  )}
                </div>
              ))}
          </section>
        )
      })}
    </>
  )
}
