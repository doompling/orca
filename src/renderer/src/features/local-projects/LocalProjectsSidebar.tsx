import { useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNow } from '@/hooks/use-now'
import type { LocalProject } from '../../../../shared/local-projects/types'
import { LocalContextActions } from './LocalContextActions'
import { LocalSidebarScopeFooter } from './LocalSidebarScopeFooter'
import { LocalSidebarWorkspaceRow } from './LocalSidebarWorkspaceRow'
import { buildLocalSidebarModel, holdRowOrder, type LocalSidebarRow } from './local-sidebar-model'
import { openLocalWorkspace } from './local-workspace-sidebar-actions'
import { translate } from '@/i18n/i18n'
import { selectFolderWorkspaces } from '@/store/workspace-record-selectors'

export function useLocalSidebarModel(showArchived: boolean) {
  const catalog = useAppStore((s) => s.localProjects)
  const folderWorkspaces = useAppStore((s) => selectFolderWorkspaces(s))
  return useMemo(
    () => buildLocalSidebarModel(catalog, folderWorkspaces, { showArchived }),
    [catalog, folderWorkspaces, showArchived]
  )
}

function LocalSidebarProjectSection({
  project,
  rows,
  now
}: {
  project: LocalProject
  rows: LocalSidebarRow[]
  now: number
}): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  // Marked Workspaces live in Marks, so look past the visible rows for the one to reopen.
  const reopenId = useAppStore((s) => {
    const open = s.localProjects.workspaces.filter(
      (entry) => entry.projectId === project.id && !entry.isArchived
    )
    return (open.find((entry) => entry.id === project.lastWorkspaceId) ?? open[0])?.id
  })
  return (
    <section className="mt-3 first:mt-1" aria-label={project.name}>
      <div className="group/project flex h-7 items-center gap-0.5">
        <button
          type="button"
          disabled={project.isArchived || !reopenId}
          className="flex h-full min-w-0 flex-1 items-center rounded-md px-2 text-left text-[13px] font-semibold text-worktree-sidebar-foreground outline-none hover:bg-worktree-sidebar-accent focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring disabled:hover:bg-transparent"
          title={translate(
            'auto.features.local.projects.LocalProjectsSidebar.fdbf8ce8ba',
            'Open the last Workspace used in this Project'
          )}
          onClick={() => reopenId && openLocalWorkspace(reopenId)}
        >
          <span className="truncate">
            {project.name}
            {project.isArchived
              ? translate(
                  'auto.features.local.projects.LocalProjectsSidebar.2adf183d70',
                  '(Archived)'
                )
              : ''}
          </span>
        </button>
        <span className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/project:opacity-100 has-[[data-state=open]]:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.features.local.projects.LocalProjectsSidebar.9e93984811',
                  'New Workspace in {{value0}}',
                  { value0: project.name }
                )}
                disabled={project.isArchived}
                onClick={() => openModal('new-workspace-composer', { localProjectId: project.id })}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'auto.features.local.projects.LocalProjectsSidebar.89f6e97480',
                'New Workspace'
              )}
            </TooltipContent>
          </Tooltip>
          <LocalContextActions kind="Project" record={project} />
        </span>
      </div>
      {rows.length > 0 ? (
        <ul className="space-y-px">
          {rows.map((row) => (
            <LocalSidebarWorkspaceRow key={row.workspace.id} row={row} now={now} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function LocalProjectsSidebar(): React.JSX.Element {
  const loaded = useAppStore((s) => s.localProjectsLoaded)
  const loadError = useAppStore((s) => s.localProjectsError)
  const openModal = useAppStore((s) => s.openModal)
  const refresh = useAppStore((s) => s.fetchLocalProjects)
  const hasArchived = useAppStore(
    (s) =>
      s.localProjects.projects.some((entry) => entry.isArchived) ||
      s.localProjects.workspaces.some((entry) => entry.isArchived)
  )
  const [showArchived, setShowArchived] = useState(false)
  const model = useLocalSidebarModel(showArchived)
  const now = useNow(30_000)
  // Why: recency re-sorts on every agent event; freeze while pointer or focus is here so rows don't move under a click.
  const [heldOrder, setHeldOrder] = useState<ReadonlyMap<string, readonly string[]> | null>(null)
  const holders = useRef({ pointer: false, focus: false })
  const hold = (holder: 'pointer' | 'focus', on: boolean) => {
    const wasHeld = holders.current.pointer || holders.current.focus
    holders.current[holder] = on
    const isHeld = holders.current.pointer || holders.current.focus
    if (isHeld && !wasHeld) {
      setHeldOrder(
        new Map(
          model.projects.map((group) => [group.project.id, group.rows.map((row) => row.worktreeId)])
        )
      )
    } else if (!isHeld && wasHeld) {
      setHeldOrder(null)
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-sleek"
        aria-label={translate(
          'auto.features.local.projects.LocalProjectsSidebar.6619ee4b63',
          'Local Projects'
        )}
        onPointerEnter={() => hold('pointer', true)}
        onPointerLeave={() => hold('pointer', false)}
        onFocus={() => hold('focus', true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            hold('focus', false)
          }
        }}
      >
        {loadError ? (
          <div className="space-y-2 p-2">
            <p role="alert" className="text-xs text-destructive">
              {loadError}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refresh().catch(() => undefined)}
            >
              {translate('auto.features.local.projects.LocalProjectsSidebar.5f45a83183', 'Retry')}
            </Button>
          </div>
        ) : null}
        {!loaded && !loadError ? (
          <p className="p-2 text-xs text-muted-foreground">
            {translate(
              'auto.features.local.projects.LocalProjectsSidebar.0967322087',
              'Loading Projects…'
            )}
          </p>
        ) : null}
        {loaded && model.projects.length === 0 ? (
          <div className="space-y-3 p-2">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.features.local.projects.LocalProjectsSidebar.6b885bf2a3',
                'Group your local directories in a Project.'
              )}
            </p>
            <Button size="sm" onClick={() => openModal('add-repo')}>
              {translate(
                'auto.features.local.projects.LocalProjectsSidebar.a525ed2b5d',
                'New Project'
              )}
            </Button>
          </div>
        ) : null}
        {model.projects.map((group) => (
          <LocalSidebarProjectSection
            key={group.project.id}
            project={group.project}
            rows={holdRowOrder(group.rows, heldOrder?.get(group.project.id))}
            now={now}
          />
        ))}
        {hasArchived || showArchived ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived
              ? translate(
                  'auto.features.local.projects.LocalProjectsSidebar.55a32d35d0',
                  'Hide archived'
                )
              : translate(
                  'auto.features.local.projects.LocalProjectsSidebar.7027add1c8',
                  'Show archived'
                )}
          </Button>
        ) : null}
      </div>
      <LocalSidebarScopeFooter />
    </div>
  )
}
