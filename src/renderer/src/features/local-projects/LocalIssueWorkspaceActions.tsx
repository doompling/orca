import { useState, type ReactNode } from 'react'
import { FolderOpen, Link, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { useLocalLinearIssueWorkspaces } from './use-local-linear-issue-workspaces'
import { translate } from '@/i18n/i18n'

export function LocalIssueWorkspaceActions({
  issue,
  sourceContext,
  legacyWorkspaceLabel,
  onOpenLegacyWorkspace,
  onCreateWorkspace,
  children
}: {
  issue: LinearIssue
  sourceContext?: TaskSourceContext | null
  legacyWorkspaceLabel?: string | null
  onOpenLegacyWorkspace?: () => void
  onCreateWorkspace?: () => void
  children: ReactNode
}): React.JSX.Element {
  const { account, targets, attached } = useLocalLinearIssueWorkspaces(issue, sourceContext)
  const attach = useAppStore((state) => state.attachLocalWorkspaceLinearIssue)
  const activate = useAppStore((state) => state.activateLocalWorkspace)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!account || targets.length === 0) {
    return <>{children}</>
  }
  const attachedIds = new Set(attached.map(({ workspace }) => workspace.id))
  const run = async (action: () => Promise<void>) => {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await action()
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          aria-label={translate(
            'auto.features.local.projects.LocalIssueWorkspaceActions.aec92e896e',
            'Workspaces for {{value0}}',
            { value0: issue.identifier }
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <FolderOpen />
          {attached.length
            ? translate(
                'auto.features.local.projects.LocalIssueWorkspaceActions.af9b835edb',
                'Workspaces ({{value0}})',
                { value0: attached.length }
              )
            : translate(
                'auto.features.local.projects.LocalIssueWorkspaceActions.5602f7513d',
                'Attach Workspace'
              )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" onClick={(event) => event.stopPropagation()}>
        <Command>
          <CommandInput
            placeholder={translate(
              'auto.features.local.projects.LocalIssueWorkspaceActions.4671128302',
              'Search Workspaces…'
            )}
            disabled={busy}
          />
          <CommandList>
            <CommandEmpty>
              {translate(
                'auto.features.local.projects.LocalIssueWorkspaceActions.84ba0284ba',
                'No matching Workspaces.'
              )}
            </CommandEmpty>
            {attached.length > 0 && (
              <CommandGroup heading="Open linked Workspace">
                {attached.map(({ workspace, label }) => (
                  <CommandItem
                    key={workspace.id}
                    value={`open ${label} ${workspace.id}`}
                    className="jump-palette-item"
                    disabled={busy}
                    onSelect={() => void run(() => activate(workspace.id))}
                  >
                    <FolderOpen />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Attach existing Workspace">
              {targets
                .filter(({ workspace }) => !attachedIds.has(workspace.id))
                .map(({ workspace, label }) => (
                  <CommandItem
                    key={workspace.id}
                    value={`attach ${label} ${workspace.id}`}
                    className="jump-palette-item"
                    disabled={busy}
                    onSelect={() =>
                      void run(() =>
                        attach({
                          workspaceId: workspace.id,
                          linearWorkspaceId: account.id,
                          issueId: issue.id
                        })
                      )
                    }
                  >
                    <Link />
                    {label}
                  </CommandItem>
                ))}
            </CommandGroup>
            {onCreateWorkspace && (
              <CommandGroup heading="Create Workspace">
                <CommandItem
                  value="New Workspace for issue"
                  className="jump-palette-item"
                  disabled={busy}
                  onSelect={() => {
                    setOpen(false)
                    onCreateWorkspace()
                  }}
                >
                  <Plus />
                  {translate(
                    'auto.features.local.projects.LocalIssueWorkspaceActions.670dd517dc',
                    'New Workspace for issue'
                  )}
                </CommandItem>
              </CommandGroup>
            )}
            {legacyWorkspaceLabel && onOpenLegacyWorkspace && (
              <CommandGroup heading="Legacy Workspace">
                <CommandItem
                  value={`legacy ${legacyWorkspaceLabel}`}
                  className="jump-palette-item"
                  disabled={busy}
                  onSelect={() => {
                    setOpen(false)
                    onOpenLegacyWorkspace()
                  }}
                >
                  <FolderOpen />
                  {legacyWorkspaceLabel}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
