import { useState } from 'react'
import { Folder, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import WorktreeCardAgents from '@/components/sidebar/WorktreeCardAgents'
import { LocalContextActions } from './LocalContextActions'
import { LocalWorkspaceLinearIssues } from './LocalWorkspaceLinearIssues'

export function LocalProjectsSidebar(): React.JSX.Element {
  const catalog = useAppStore((s) => s.localProjects)
  const loaded = useAppStore((s) => s.localProjectsLoaded)
  const loadError = useAppStore((s) => s.localProjectsError)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activate = useAppStore((s) => s.activateLocalWorkspace)
  const openModal = useAppStore((s) => s.openModal)
  const refresh = useAppStore((s) => s.fetchLocalProjects)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const selectWorkspace = async (id: string) => {
    setError(null)
    try {
      await activate(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const projects = catalog.projects.filter((entry) => showArchived || !entry.isArchived)
  const hasArchived =
    catalog.projects.some((entry) => entry.isArchived) ||
    catalog.workspaces.some((entry) => entry.isArchived)
  return (
    <div
      className="min-h-0 flex-1 overflow-auto px-2 pb-3 scrollbar-sleek"
      aria-label="Local Projects"
    >
      {(error || loadError) && (
        <div className="space-y-2 p-2">
          <p role="alert" className="text-xs text-destructive">
            {error || loadError}
          </p>
          {loadError && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refresh().catch(() => undefined)}
            >
              Retry
            </Button>
          )}
        </div>
      )}
      {!loaded && !loadError && (
        <p className="p-2 text-xs text-muted-foreground">Loading Projects…</p>
      )}
      {loaded && projects.length === 0 && (
        <div className="space-y-3 p-2">
          <p className="text-xs text-muted-foreground">
            Group your local directories in a Project.
          </p>
          <Button size="sm" onClick={() => openModal('add-repo')}>
            New Project
          </Button>
        </div>
      )}
      {projects.map((project) => {
        const workspaces = catalog.workspaces.filter(
          (entry) => entry.projectId === project.id && (showArchived || !entry.isArchived)
        )
        const lastWorkspace =
          workspaces.find((entry) => entry.id === project.lastWorkspaceId && !entry.isArchived) ??
          workspaces.find((entry) => !entry.isArchived)
        return (
          <section key={project.id} className="mb-3" aria-label={project.name}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={project.isArchived}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-sidebar-accent"
                onClick={() => {
                  if (lastWorkspace) {
                    void selectWorkspace(lastWorkspace.id)
                  }
                }}
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {project.name}
                  {project.isArchived ? ' (Archived)' : ''}
                </span>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`New Workspace in ${project.name}`}
                    disabled={project.isArchived}
                    onClick={() =>
                      openModal('new-workspace-composer', { localProjectId: project.id })
                    }
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Workspace</TooltipContent>
              </Tooltip>
              <LocalContextActions kind="Project" record={project} />
            </div>
            <ul className="space-y-1 pl-3">
              {workspaces.map((workspace) => {
                const selected = activeWorktreeId === `folder:${workspace.id}`
                return (
                  <li key={workspace.id}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        data-worktree-id={`folder:${workspace.id}`}
                        data-current={selected}
                        aria-current={selected ? 'page' : undefined}
                        disabled={project.isArchived || workspace.isArchived}
                        className={cn(
                          'min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent',
                          selected && 'bg-sidebar-accent text-sidebar-accent-foreground'
                        )}
                        onClick={() => void selectWorkspace(workspace.id)}
                      >
                        <span className="block truncate">
                          {workspace.name}
                          {workspace.isArchived ? ' (Archived)' : ''}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {project.roots.map((root) => root.label).join(' · ')}
                        </span>
                      </button>
                      <LocalContextActions kind="Workspace" record={workspace} />
                    </div>
                    {((workspace.linearIssues?.length ?? 0) > 0 ||
                      (!workspace.isArchived && !project.isArchived)) && (
                      <div className="mr-7 min-w-0 pb-1">
                        <LocalWorkspaceLinearIssues workspaceId={workspace.id} sidebar />
                      </div>
                    )}
                    {!workspace.isArchived && !project.isArchived && (
                      <WorktreeCardAgents worktreeId={`folder:${workspace.id}`} />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {(hasArchived || showArchived) && (
        <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      )}
    </div>
  )
}
