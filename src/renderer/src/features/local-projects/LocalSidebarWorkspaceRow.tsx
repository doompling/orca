import React, { useMemo } from 'react'
import { Archive, Bot, GitBranch } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import StatusIndicator from '@/components/sidebar/StatusIndicator'
import WorktreeCardAgents from '@/components/sidebar/WorktreeCardAgents'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { useWorktreeActivityStatus } from '@/components/sidebar/use-worktree-activity-status'
import { LocalContextActions } from './LocalContextActions'
import {
  checkoutOverrideLabel,
  formatLocalSidebarAge,
  partitionLocalSidebarAgents,
  type LocalSidebarRow
} from './local-sidebar-model'
import { openLocalWorkspace } from './local-workspace-sidebar-actions'

// Same cap treatment as the Search shortcut chip in SidebarNav.
const MARK_KEY_CAP_CLASS_NAME =
  'min-w-4 border-worktree-sidebar-border/80 bg-worktree-sidebar-foreground/8 px-1 py-px text-[10px] text-worktree-sidebar-foreground/55 shadow-none'

type Props = {
  row: LocalSidebarRow
  now: number
  /** Marks list rows away from their Project, so they carry its name. */
  showProjectName?: boolean
}

export const LocalSidebarWorkspaceRow = React.memo(function LocalSidebarWorkspaceRow({
  row,
  now,
  showProjectName = false
}: Props) {
  const { project, workspace, worktreeId } = row
  const isActive = useAppStore((state) => state.activeWorktreeId === worktreeId)
  const status = useWorktreeActivityStatus(worktreeId)
  const agents = useWorktreeAgentRows(worktreeId)
  const { shown, hiddenCount } = useMemo(
    () => partitionLocalSidebarAgents(agents, { isActive, isUnread: row.isUnread }),
    [agents, isActive, row.isUnread]
  )
  const archived = workspace.isArchived || project.isArchived
  const overrides = project.roots.flatMap((root) => {
    const path = workspace.checkoutOverridesByRootId[root.id]
    return path ? [{ root, path }] : []
  })
  const linearIssues = workspace.linearIssues ?? []
  const showStatus = status !== 'inactive' && status !== 'active'

  return (
    <li data-workspace-id={workspace.id} data-project-id={project.id}>
      <LocalContextActions kind="Workspace" record={workspace}>
        {(menuButton) => (
          <div
            data-current={isActive}
            className="group/ws @container/ws flex h-7 items-center rounded-md text-[13px] text-worktree-sidebar-foreground hover:bg-worktree-sidebar-accent data-[current=true]:bg-worktree-sidebar-accent data-[current=true]:text-worktree-sidebar-accent-foreground"
          >
            <button
              type="button"
              disabled={archived}
              data-worktree-id={worktreeId}
              aria-current={isActive ? 'page' : undefined}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring disabled:opacity-60"
              onClick={() => openLocalWorkspace(workspace.id)}
            >
              <span className="flex size-3 shrink-0 items-center justify-center">
                {archived ? (
                  <Archive className="size-3 text-muted-foreground" aria-hidden />
                ) : showStatus ? (
                  <StatusIndicator status={status} />
                ) : row.isUnread ? (
                  <span
                    className="size-1.5 rounded-full bg-worktree-sidebar-foreground"
                    title="New activity"
                  />
                ) : null}
              </span>
              {/* Why shrink weights: the name keeps its room; extras give way first. */}
              <span
                className={cn(
                  'min-w-[5.5em] flex-auto truncate',
                  (isActive || row.isUnread) && 'font-medium'
                )}
              >
                {workspace.name}
              </span>
              {archived ? <span className="sr-only"> (Archived)</span> : null}
              {row.isUnread && !archived ? <span className="sr-only">, new activity</span> : null}
              {overrides.map(({ root, path }) => (
                <span
                  key={root.id}
                  title={`${root.label} uses ${path}`}
                  className="flex max-w-[40%] min-w-0 shrink-[4] items-center gap-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  <GitBranch className="size-3 shrink-0" />
                  <span className="truncate">{checkoutOverrideLabel(path)}</span>
                </span>
              ))}
              {linearIssues.length > 0 ? (
                <span
                  className="shrink-0 font-mono text-[11px] text-muted-foreground @max-[15rem]/ws:hidden"
                  title={linearIssues
                    .map((issue) => `${issue.identifier} ${issue.title}`)
                    .join('\n')}
                >
                  {linearIssues[0].identifier}
                  {linearIssues.length > 1 ? ` +${linearIssues.length - 1}` : ''}
                </span>
              ) : null}
              {showProjectName ? (
                <span className="max-w-[40%] min-w-0 shrink-[4] truncate text-[11px] text-muted-foreground @max-[16rem]/ws:hidden">
                  {project.name}
                </span>
              ) : null}
              {hiddenCount > 0 ? (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
                  title={`${hiddenCount} idle agent${hiddenCount === 1 ? '' : 's'}`}
                >
                  <Bot className="size-3" />
                  {hiddenCount}
                </span>
              ) : null}
              {workspace.markSlot !== undefined && !archived ? (
                <ShortcutKeyCombo
                  keys={[String(workspace.markSlot)]}
                  className="inline-flex shrink-0"
                  keyCapClassName={MARK_KEY_CAP_CLASS_NAME}
                />
              ) : null}
            </button>
            {/* Why fixed width: the age and the ⋯ trigger swap in place, so hovering never shifts the row. */}
            <span className="relative flex h-full w-8 shrink-0 items-center justify-end pr-1.5">
              {archived ? null : (
                <span className="text-[11px] tabular-nums text-muted-foreground group-focus-within/ws:invisible group-hover/ws:invisible group-has-[[data-state=open]]/ws:invisible">
                  {formatLocalSidebarAge(row.activityAt, now)}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-end pr-0.5 opacity-0 focus-within:opacity-100 group-hover/ws:opacity-100 has-[[data-state=open]]:opacity-100">
                {menuButton}
              </span>
            </span>
          </div>
        )}
      </LocalContextActions>
      {archived ? null : (
        <WorktreeCardAgents worktreeId={worktreeId} agents={shown} className="mt-0 ml-3.5" />
      )}
    </li>
  )
})
