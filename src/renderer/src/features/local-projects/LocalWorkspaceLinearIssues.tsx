import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LINEAR_INTEGRATION_SECTION_ID } from '@/components/settings/task-provider-integration-section-ids'
import { LocalWorkspaceLinearIssuePicker } from './LocalWorkspaceLinearIssuePicker'
import { localWorkspaceLinearIssueKey } from '../../../../shared/local-projects/linear-issues'

export function LocalWorkspaceLinearIssues({
  workspaceId
}: {
  workspaceId: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const count = useAppStore(
    (state) =>
      state.localProjects.workspaces.find((workspace) => workspace.id === workspaceId)?.linearIssues
        ?.length ?? 0
  )
  const profileId = useAppStore((state) => state.activeOrcaProfileId)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 />
          Linear issues ({count})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw]">
        <LocalWorkspaceLinearIssuesContent
          key={`${profileId}:${workspaceId}`}
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
        />
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    if (busy || switching) {
      return
    }
    setBusy(true)
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
            <div className="flex gap-1">
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
          Updating links…
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
