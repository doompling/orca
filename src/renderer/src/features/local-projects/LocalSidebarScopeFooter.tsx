import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useAppStore } from '@/store'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'
import { resolveLocalWorkspaceKey } from '../../../../shared/local-projects/workspace-resolution'
import { useLocalRootGit } from './use-local-root-git'
import { LocalWorkspaceCheckoutDialog } from './LocalWorkspaceCheckoutDialog'
import { translate } from '@/i18n/i18n'

function RootChip({
  workspaceId,
  root,
  overridden,
  onEdit
}: {
  workspaceId: string
  root: LocalProjectRoot
  overridden: boolean
  onEdit: () => void
}): React.JSX.Element {
  const { status } = useLocalRootGit(workspaceId, root)
  const dirty = (status?.entries.length ?? 0) > 0
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={translate(
        'auto.features.local.projects.LocalSidebarScopeFooter.e5719d3e1d',
        '{{value0}}{{value1}}. Edit Workspace checkouts',
        { value0: root.label, value1: status?.branch ? ` on ${status.branch}` : '' }
      )}
      title={`${root.path}${overridden ? '\nSeparate checkout for this Workspace' : ''}${dirty ? '\nUncommitted changes' : ''}`}
      className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-full border border-worktree-sidebar-border px-1.5 font-mono text-[11px] text-muted-foreground outline-none hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-foreground focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring data-[overridden=true]:border-dashed"
      data-overridden={overridden}
    >
      <span className="shrink-0">{root.label}</span>
      {status?.branch ? (
        <>
          <GitBranch className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{status.branch}</span>
        </>
      ) : null}
      {dirty ? (
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--git-decoration-modified)]" />
      ) : null}
    </button>
  )
}

/** The open Workspace's roots and branches; roots are shown here instead of under every row. */
export function LocalSidebarScopeFooter(): React.JSX.Element | null {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const catalog = useAppStore((state) => state.localProjects)
  const resolved = activeWorktreeId ? resolveLocalWorkspaceKey(catalog, activeWorktreeId) : null
  const workspace = catalog.workspaces.find((entry) => entry.id === resolved?.workspaceId)
  const project = catalog.projects.find((entry) => entry.id === resolved?.projectId)
  const [editing, setEditing] = useState(false)
  if (!resolved || !workspace || !project) {
    return null
  }
  return (
    <div
      className="shrink-0 space-y-1 border-t border-worktree-sidebar-border px-3 py-2"
      aria-label={translate(
        'auto.features.local.projects.LocalSidebarScopeFooter.7c3d3f2b87',
        'Open Workspace directories'
      )}
    >
      <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
        <span className="truncate font-medium">{workspace.name}</span>
        <span className="truncate text-muted-foreground">{project.name}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {resolved.roots.map((root) => (
          <RootChip
            key={`${root.id}:${root.path}`}
            workspaceId={workspace.id}
            root={root}
            overridden={Object.hasOwn(workspace.checkoutOverridesByRootId, root.id)}
            onEdit={() => setEditing(true)}
          />
        ))}
      </div>
      {editing ? (
        <LocalWorkspaceCheckoutDialog
          project={project}
          workspace={workspace}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  )
}
