import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { LINEAR_INTEGRATION_SECTION_ID } from '@/components/settings/task-provider-integration-section-ids'
import { useMountedRef } from '@/hooks/useMountedRef'
import { LocalWorkspaceLinearIssuePicker } from './LocalWorkspaceLinearIssuePicker'
import {
  localWorkspaceLinearIssueKey,
  type LocalWorkspaceLinearIssue
} from '../../../../shared/local-projects/linear-issues'
import {
  readLocalWorkspaceLinkedIssue,
  requireLocalWorkspaceLinearAccount
} from './local-workspace-linear-issue-reads'

export function LocalWorkspaceLinearIssues({
  workspaceId,
  sidebar = false
}: {
  workspaceId: string
  sidebar?: boolean
}): React.JSX.Element {
  const workspace = useAppStore((state) =>
    state.localProjects.workspaces.find((entry) => entry.id === workspaceId)
  )
  const links = workspace?.linearIssues ?? []
  const controls = {
    workspaceId,
    workspaceName: workspace?.name ?? 'Workspace',
    sidebar,
    count: links.length
  }
  return (
    <div className={cn(sidebar && 'space-y-1')}>
      {/* Keep the first popover open while attaching or unlinking its issue. */}
      <LocalWorkspaceLinearIssuePopover {...controls} issue={sidebar ? links[0] : undefined} />
      {sidebar &&
        links
          .slice(1)
          .map((issue) => (
            <LocalWorkspaceLinearIssuePopover
              key={localWorkspaceLinearIssueKey(issue)}
              {...controls}
              issue={issue}
            />
          ))}
    </div>
  )
}

function LocalWorkspaceLinearIssuePopover({
  workspaceId,
  workspaceName,
  sidebar,
  count,
  issue
}: {
  workspaceId: string
  workspaceName: string
  sidebar: boolean
  count: number
  issue?: LocalWorkspaceLinearIssue
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  const trigger = (
    <PopoverTrigger asChild>
      <Button
        variant="ghost"
        size={sidebar ? 'xs' : 'sm'}
        className={cn(sidebar && 'w-full min-w-0 justify-start')}
        aria-label={
          sidebar
            ? issue
              ? `Linear issue ${issue.identifier}: ${issue.title} for ${workspaceName}`
              : `Link Linear issue to ${workspaceName}`
            : undefined
        }
      >
        <Link2 aria-hidden="true" />
        {sidebar ? (
          issue ? (
            <>
              <span className="shrink-0">{issue.identifier}</span>
              <span className="min-w-0 truncate text-muted-foreground">{issue.title}</span>
            </>
          ) : (
            <span className="truncate text-muted-foreground">Link Linear issue</span>
          )
        ) : (
          <>Linear issues ({count})</>
        )}
      </Button>
    </PopoverTrigger>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {sidebar && issue ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={4} className="max-w-xs">
            {issue.identifier} · {issue.title}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <PopoverContent
        side={sidebar ? 'right' : 'bottom'}
        align="start"
        collisionPadding={8}
        className="w-96 max-w-[90vw]"
      >
        <div className="max-h-(--radix-popover-content-available-height) overflow-y-auto scrollbar-sleek">
          <LocalWorkspaceLinearIssuesContent
            key={`${profileId}:${workspaceId}`}
            workspaceId={workspaceId}
            onClose={() => setOpen(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function LocalWorkspaceLinearIssuesContent({
  workspaceId,
  onClose
}: {
  workspaceId: string
  onClose: () => void
}): React.JSX.Element {
  const workspace = useAppStore((state) =>
    state.localProjects.workspaces.find((entry) => entry.id === workspaceId)
  )
  const project = useAppStore((state) =>
    state.localProjects.projects.find((entry) => entry.id === workspace?.projectId)
  )
  const switching = useAppStore((state) => state.orcaProfileSwitching)
  const attach = useAppStore((state) => state.attachLocalWorkspaceLinearIssue)
  const detach = useAppStore((state) => state.detachLocalWorkspaceLinearIssue)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openTaskPage = useAppStore((state) => state.openTaskPage)
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  const mounted = useMountedRef()
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState('Updating links…')
  const [error, setError] = useState<string | null>(null)
  const isCurrentProfile = () => {
    const current = useAppStore.getState()
    return (
      mounted.current && current.activeOrcaProfileId === profileId && !current.orcaProfileSwitching
    )
  }
  const run = async (action: () => Promise<void>, label = 'Updating links…') => {
    if (busy || switching) {
      return
    }
    setBusy(true)
    setActivity(label)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const links = workspace?.linearIssues ?? []
  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Workspace Linear issues</h3>
        <p className="text-xs text-muted-foreground">
          {workspace?.name ?? 'Workspace unavailable'}. Linking does not change Linear status,
          files, or sessions.
        </p>
      </div>
      {links.length === 0 && <p className="text-xs text-muted-foreground">No linked issues.</p>}
      <ul
        aria-label="Linked Linear issues"
        className="max-h-64 space-y-3 overflow-y-auto scrollbar-sleek"
      >
        {links.map((link) => (
          <li key={localWorkspaceLinearIssueKey(link)} className="space-y-1">
            <p className="text-sm">
              {link.identifier} · {link.title}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{link.state.name}</Badge>
              <span className="text-xs text-muted-foreground">Saved snapshot</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="xs"
                aria-label={`Open ${link.identifier} in Ether`}
                disabled={busy || switching}
                onClick={() =>
                  void run(async () => {
                    const issue = await readLocalWorkspaceLinkedIssue(link)
                    if (!isCurrentProfile()) {
                      return
                    }
                    openTaskPage({
                      taskSource: 'linear',
                      openLinearIssue: issue,
                      openLinearSourceContext: {
                        kind: 'task-source',
                        provider: 'linear',
                        hostId: 'local',
                        projectId: workspace?.projectId ?? 'account-backed-task-source',
                        providerIdentity: {
                          provider: 'linear',
                          workspaceId: link.linearWorkspaceId
                        }
                      }
                    })
                    onClose()
                  }, 'Loading issue…')
                }
              >
                Open issue
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Open ${link.identifier} in Linear`}
                onClick={() =>
                  void window.api.shell
                    .openUrl(link.url)
                    .catch((cause: unknown) =>
                      setError(cause instanceof Error ? cause.message : String(cause))
                    )
                }
                disabled={busy || switching}
              >
                Open in Linear
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Refresh ${link.identifier} details`}
                disabled={busy || switching || workspace?.isArchived || project?.isArchived}
                onClick={() =>
                  void run(async () => {
                    await requireLocalWorkspaceLinearAccount(link)
                    if (!isCurrentProfile()) {
                      return
                    }
                    await attach({
                      workspaceId,
                      linearWorkspaceId: link.linearWorkspaceId,
                      issueId: link.issueId
                    })
                  }, 'Refreshing saved details…')
                }
              >
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Unlink ${link.identifier}`}
                onClick={() =>
                  void run(() =>
                    detach({
                      workspaceId,
                      organizationId: link.organizationId,
                      issueId: link.issueId
                    })
                  )
                }
                disabled={busy || switching}
              >
                Unlink
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-muted-foreground">
          {activity}
        </p>
      )}
      {workspace && project && !workspace.isArchived && !project.isArchived && !switching ? (
        <LocalWorkspaceLinearIssuePicker
          links={links}
          disabled={busy}
          onAttach={(linearWorkspaceId, issueId) =>
            void run(() => attach({ workspaceId, linearWorkspaceId, issueId }))
          }
          onSettings={() => {
            onClose()
            openSettingsPage()
            openSettingsTarget({
              pane: 'integrations',
              repoId: null,
              sectionId: LINEAR_INTEGRATION_SECTION_ID
            })
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Open an active Workspace to link another issue.
        </p>
      )}
    </div>
  )
}
