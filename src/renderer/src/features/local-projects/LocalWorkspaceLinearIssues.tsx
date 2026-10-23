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
import { translate } from '@/i18n/i18n'

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
              ? translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.49c0f1c6e0',
                  'Linear issue {{value0}}: {{value1}} for {{value2}}',
                  { value0: issue.identifier, value1: issue.title, value2: workspaceName }
                )
              : translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.122cc3bd24',
                  'Link Linear issue to {{value0}}',
                  { value0: workspaceName }
                )
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
            <span className="truncate text-muted-foreground">
              {translate(
                'auto.features.local.projects.LocalWorkspaceLinearIssues.5400eefe20',
                'Link Linear issue'
              )}
            </span>
          )
        ) : (
          <>
            {translate(
              'auto.features.local.projects.LocalWorkspaceLinearIssues.53ad8a3ef1',
              'Linear issues ('
            )}
            {count})
          </>
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
  onClose,
  padded = true
}: {
  workspaceId: string
  onClose: () => void
  /** Off inside a Dialog, which already pads its content. */
  padded?: boolean
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
    <div className={cn('space-y-3', padded && 'p-4')}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssues.59ceaa5f63',
            'Workspace Linear issues'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {workspace?.name ??
            translate(
              'auto.features.local.projects.LocalWorkspaceLinearIssues.109b3bcd12',
              'Workspace unavailable'
            )}
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssues.96b2e2ee66',
            '. Linking does not change Linear status, files, or sessions.'
          )}
        </p>
      </div>
      {links.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssues.00bf4a91dd',
            'No linked issues.'
          )}
        </p>
      )}
      <ul
        aria-label={translate(
          'auto.features.local.projects.LocalWorkspaceLinearIssues.72d8c43484',
          'Linked Linear issues'
        )}
        className="max-h-64 space-y-3 overflow-y-auto scrollbar-sleek"
      >
        {links.map((link) => (
          <li key={localWorkspaceLinearIssueKey(link)} className="space-y-1">
            <p className="text-sm">
              {link.identifier} · {link.title}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{link.state.name}</Badge>
              <span className="text-xs text-muted-foreground">
                {translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.55f576317c',
                  'Saved snapshot'
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="xs"
                aria-label={translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.f43cfb4231',
                  'Open {{value0}} in Ether',
                  { value0: link.identifier }
                )}
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
                {translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.b0ab5e3730',
                  'Open issue'
                )}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={translate(
                  'localProjects.linearIssues.openInLinear',
                  'Open {{value0}} in Linear',
                  { value0: link.identifier }
                )}
                onClick={() =>
                  void window.api.shell
                    .openUrl(link.url)
                    .catch((cause: unknown) =>
                      setError(cause instanceof Error ? cause.message : String(cause))
                    )
                }
                disabled={busy || switching}
              >
                {translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.32b5ad0411',
                  'Open in Linear'
                )}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.9922ccec18',
                  'Refresh {{value0}} details',
                  { value0: link.identifier }
                )}
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
                {translate('localProjects.linearIssues.refresh', 'Refresh')}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssues.82ee7f1db1',
                  'Unlink {{value0}}',
                  { value0: link.identifier }
                )}
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
                {translate('localProjects.linearIssues.unlink', 'Unlink')}
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
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssues.9095fa7983',
            'Open an active Workspace to link another issue.'
          )}
        </p>
      )}
    </div>
  )
}
