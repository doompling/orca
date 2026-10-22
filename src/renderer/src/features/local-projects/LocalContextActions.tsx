import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { Button } from '@/components/ui/button'
import { ProjectGroupNameDialog } from '@/components/sidebar/ProjectGroupNameDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { LocalProjectDialog } from './LocalProjectDialog'
import { LocalWorkspaceCheckoutDialog } from './LocalWorkspaceCheckoutDialog'
import {
  archiveLocalWorkspace,
  requestLocalWorkspaceLinearIssues,
  toggleLocalWorkspaceMark
} from './local-workspace-sidebar-actions'

type MenuEntry =
  | {
      kind: 'item'
      label: string
      shortcut?: string | null
      disabled?: boolean
      onSelect: () => void
    }
  | { kind: 'separator' }
  | { kind: 'note'; label: string }

function entryKey(entry: MenuEntry): string {
  return entry.kind === 'separator' ? 'separator' : entry.label
}

type Props = {
  kind: 'Project' | 'Workspace'
  record: { id: string; name: string; isArchived: boolean }
  className?: string
  /** Makes the row a right-click target too, sharing one menu model and dialog tree; place the ⋯ button it receives. */
  children?: (menuButton: React.ReactNode) => React.ReactNode
}

export function LocalContextActions({
  kind,
  record,
  className,
  children
}: Props): React.JSX.Element {
  const updateProject = useAppStore((state) => state.updateLocalProject)
  const updateWorkspace = useAppStore((state) => state.updateLocalWorkspace)
  const workspace = useAppStore((state) =>
    kind === 'Workspace'
      ? state.localProjects.workspaces.find((entry) => entry.id === record.id)
      : undefined
  )
  const project = useAppStore((state) =>
    state.localProjects.projects.find(
      (entry) => entry.id === (kind === 'Project' ? record.id : workspace?.projectId)
    )
  )
  const active = useAppStore((state) => {
    if (kind === 'Workspace') {
      return state.activeWorktreeId === folderWorkspaceKey(record.id)
    }
    return state.localProjects.workspaces.some(
      (entry) =>
        entry.projectId === record.id && state.activeWorktreeId === folderWorkspaceKey(entry.id)
    )
  })
  const markShortcut = useOptionalShortcutLabel('workspace.toggleMark')
  const archiveShortcut = useOptionalShortcutLabel('workspace.delete')
  const [renaming, setRenaming] = useState(false)
  const [editing, setEditing] = useState(false)
  const update = (updates: { name?: string; isArchived?: boolean }) =>
    kind === 'Project'
      ? updateProject({ projectId: record.id, updates })
      : updateWorkspace({ workspaceId: record.id, updates })
  const toggleArchive = async () => {
    if (kind === 'Workspace' && !record.isArchived) {
      await archiveLocalWorkspace(record.id)
      return
    }
    try {
      await update({ isArchived: !record.isArchived })
    } catch (cause) {
      toast.error(`Could not ${record.isArchived ? 'restore' : 'archive'} ${record.name}.`, {
        description: cause instanceof Error ? cause.message : String(cause)
      })
    }
  }

  // Why: an open Project's Workspaces would vanish from under the user; Workspaces hand off via the successor picker instead.
  const projectArchiveBlocked = kind === 'Project' && active && !record.isArchived
  // Frequent verbs first; rare and destructive ones last.
  const entries: MenuEntry[] = []
  if (workspace && !workspace.isArchived) {
    entries.push(
      {
        kind: 'item',
        label: workspace.markSlot === undefined ? 'Add mark' : `Remove mark ${workspace.markSlot}`,
        shortcut: active ? markShortcut : null,
        onSelect: () => void toggleLocalWorkspaceMark(workspace.id)
      },
      {
        kind: 'item',
        label: 'Linear issues…',
        onSelect: () => requestLocalWorkspaceLinearIssues(workspace.id)
      }
    )
  }
  entries.push(
    { kind: 'item', label: `Rename ${kind}`, onSelect: () => setRenaming(true) },
    {
      kind: 'item',
      label: kind === 'Project' ? 'Edit Project roots…' : 'Edit Workspace checkouts…',
      disabled: !project || record.isArchived || project.isArchived,
      onSelect: () => setEditing(true)
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: `${record.isArchived ? 'Restore' : 'Archive'} ${kind}`,
      shortcut: kind === 'Workspace' && active && !record.isArchived ? archiveShortcut : null,
      disabled: projectArchiveBlocked,
      onSelect: () => void toggleArchive()
    }
  )
  if (projectArchiveBlocked) {
    entries.push({ kind: 'note', label: 'Switch away before archiving.' })
  }

  const dialogs = (
    <>
      <ProjectGroupNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename ${kind}`}
        description="This changes the label only. Files, branches, and saved state stay where they are."
        initialName={record.name}
        nameLabel={`${kind} name`}
        confirmLabel="Save name"
        onSubmit={(name) => update({ name })}
      />
      {editing &&
        project &&
        (kind === 'Project' ? (
          <LocalProjectDialog project={project} onClose={() => setEditing(false)} />
        ) : (
          workspace && (
            <LocalWorkspaceCheckoutDialog
              project={project}
              workspace={workspace}
              onClose={() => setEditing(false)}
            />
          )
        ))}
    </>
  )

  const menuButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={className}
          aria-label={`${kind} actions for ${record.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {entries.map((entry) =>
          entry.kind === 'separator' ? (
            <DropdownMenuSeparator key={entryKey(entry)} />
          ) : entry.kind === 'note' ? (
            <DropdownMenuLabel key={entryKey(entry)}>{entry.label}</DropdownMenuLabel>
          ) : (
            <DropdownMenuItem
              key={entryKey(entry)}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
            >
              {entry.label}
              {entry.shortcut ? (
                <DropdownMenuShortcut>{entry.shortcut}</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (!children) {
    return (
      <>
        {menuButton}
        {dialogs}
      </>
    )
  }
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children(menuButton)}</ContextMenuTrigger>
        <ContextMenuContent>
          {entries.map((entry) =>
            entry.kind === 'separator' ? (
              <ContextMenuSeparator key={entryKey(entry)} />
            ) : entry.kind === 'note' ? (
              <ContextMenuLabel key={entryKey(entry)}>{entry.label}</ContextMenuLabel>
            ) : (
              <ContextMenuItem
                key={entryKey(entry)}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
              >
                {entry.label}
                {entry.shortcut ? (
                  <ContextMenuShortcut>{entry.shortcut}</ContextMenuShortcut>
                ) : null}
              </ContextMenuItem>
            )
          )}
        </ContextMenuContent>
      </ContextMenu>
      {dialogs}
    </>
  )
}
