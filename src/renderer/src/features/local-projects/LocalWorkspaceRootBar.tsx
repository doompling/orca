import { Folder, Terminal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import type { ResolvedLocalWorkspace } from '../../../../shared/local-projects/types'
import { resolveLocalWorkspace } from '../../../../shared/local-projects/workspace-resolution'

export function LocalWorkspaceRootBar({
  context,
  selectedRootId,
  onSelect
}: {
  context: ResolvedLocalWorkspace
  selectedRootId: string
  onSelect: (rootId: string) => void
}): React.JSX.Element {
  const openTerminal = useAppStore((state) => state.openNewTerminalTabInActiveWorkspace)
  const catalog = useAppStore((state) => state.localProjects)
  const [error, setError] = useState<string | null>(null)
  const selected = context.roots.find((root) => root.id === selectedRootId)
  const defaultRoot = context.roots.find((root) => root.id === context.defaultRootId)
  const sharedBy = selected
    ? catalog.workspaces.filter(
        (workspace) =>
          workspace.id !== context.workspaceId &&
          resolveLocalWorkspace(catalog, workspace.id)?.roots.some(
            (root) => root.path === selected.path
          )
      ).length
    : 0
  return (
    <div className="space-y-2 border-b border-border p-2">
      <p className="text-xs font-medium text-muted-foreground">Workspace directories</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Browse directory">
        {context.roots.map((root) => (
          <Button
            key={root.id}
            variant={selectedRootId === root.id ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={selectedRootId === root.id}
            title={root.path}
            onClick={() => onSelect(root.id)}
          >
            <Folder />
            {root.label}
          </Button>
        ))}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={selected?.path}>
        {selected?.path}
      </p>
      <p className="text-xs text-muted-foreground">
        Default command directory: {defaultRoot?.label}
      </p>
      {sharedBy > 0 && (
        <p className="text-xs text-muted-foreground">
          Shared with {sharedBy} other Workspace{sharedBy === 1 ? '' : 's'}. Saved files change in
          every view; drafts stay separate.
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null)
          const state = useAppStore.getState()
          if (!state.activeWorktreeId) {
            return
          }
          const groupId =
            state.activeGroupIdByWorktree[state.activeWorktreeId] ??
            state.ensureWorktreeRootGroup(state.activeWorktreeId)
          void openTerminal(groupId, { rootId: selectedRootId }).catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : String(cause))
          )
        }}
      >
        <Terminal />
        Terminal in this directory
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
