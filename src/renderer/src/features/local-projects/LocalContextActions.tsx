import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { ProjectGroupNameDialog } from '@/components/sidebar/ProjectGroupNameDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { LocalProjectDialog } from './LocalProjectDialog'
import { LocalWorkspaceCheckoutDialog } from './LocalWorkspaceCheckoutDialog'

export function LocalContextActions({
  kind,
  record
}: {
  kind: 'Project' | 'Workspace'
  record: { id: string; name: string; isArchived: boolean }
}): React.JSX.Element {
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
      return state.activeWorktreeId === `folder:${record.id}`
    }
    return state.localProjects.workspaces.some(
      (workspace) =>
        workspace.projectId === record.id && state.activeWorktreeId === `folder:${workspace.id}`
    )
  })
  const [renaming, setRenaming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = (updates: { name?: string; isArchived?: boolean }) =>
    kind === 'Project'
      ? updateProject({ projectId: record.id, updates })
      : updateWorkspace({ workspaceId: record.id, updates })
  const toggleArchive = async () => {
    setBusy(true)
    setError(null)
    try {
      await update({ isArchived: !record.isArchived })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${kind} actions for ${record.name}`}
            disabled={busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename {kind}</DropdownMenuItem>
          <DropdownMenuItem
            disabled={!project || record.isArchived || project.isArchived}
            onSelect={() => setEditing(true)}
          >
            {kind === 'Project' ? 'Edit Project roots' : 'Edit Workspace checkouts'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={active && !record.isArchived}
            onSelect={() => void toggleArchive()}
          >
            {record.isArchived ? 'Restore' : 'Archive'} {kind}
          </DropdownMenuItem>
          {active && !record.isArchived && (
            <DropdownMenuLabel>Switch away before archiving.</DropdownMenuLabel>
          )}
          <DropdownMenuLabel>Archiving keeps files, tabs, and sessions.</DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
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
}
