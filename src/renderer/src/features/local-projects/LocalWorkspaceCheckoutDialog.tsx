import { useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { LocalProject, LocalWorkspace } from '../../../../shared/local-projects/types'
import { localWorkspaceCheckoutScope } from '../../../../shared/local-projects/scope-update'
import { LocalWorkspaceCheckoutChoices } from './LocalWorkspaceCheckoutChoices'
import { translate } from '@/i18n/i18n'

export function LocalWorkspaceCheckoutDialog({
  project,
  workspace,
  onClose
}: {
  project: LocalProject
  workspace: LocalWorkspace
  onClose: () => void
}): React.JSX.Element {
  const updateCheckouts = useAppStore((state) => state.updateLocalWorkspaceCheckouts)
  const [original] = useState(() => ({
    project: structuredClone(project),
    workspace: structuredClone(workspace)
  }))
  const [overrides, setOverrides] = useState(original.workspace.checkoutOverridesByRootId)
  const [defaultRootId, setDefaultRootId] = useState<string | null>(
    original.workspace.defaultRootId ?? null
  )
  const [busy, setBusy] = useState(false)
  const [creatingWorktree, setCreatingWorktree] = useState(false)
  const disabled = busy || creatingWorktree
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (disabled) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateCheckouts({
        workspaceId: original.workspace.id,
        expected: localWorkspaceCheckoutScope(original.project, original.workspace),
        checkoutOverridesByRootId: Object.fromEntries(
          Object.entries(overrides)
            .map(([id, path]) => [id, path.trim()])
            .filter(([, path]) => path)
        ),
        defaultRootId
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.features.local.projects.LocalWorkspaceCheckoutDialog.23aefebea5',
              'Edit Workspace checkouts'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'localProjects.checkoutDialog.description',
              'Directory choices for {{name}}. Clean tabs from replaced checkouts will close. Files stay where they are.',
              { name: original.workspace.name }
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <LocalWorkspaceCheckoutChoices
            projectId={original.project.id}
            roots={original.project.roots}
            overrides={overrides}
            onChange={setOverrides}
            disabled={disabled}
            onBusyChange={setCreatingWorktree}
            initiallyExpanded
          />
          <div className="space-y-2">
            <Label htmlFor="local-checkout-default">
              {translate(
                'auto.features.local.projects.LocalWorkspaceCheckoutDialog.cbffb0dde9',
                'Default command directory'
              )}
            </Label>
            <Select
              value={defaultRootId === null ? 'project' : `root:${defaultRootId}`}
              onValueChange={(value) =>
                setDefaultRootId(value === 'project' ? null : value.slice('root:'.length))
              }
              disabled={disabled}
            >
              <SelectTrigger id="local-checkout-default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">
                  {translate(
                    'auto.features.local.projects.LocalWorkspaceCheckoutDialog.efb785fa5c',
                    'Use Project default'
                  )}
                </SelectItem>
                {original.project.roots.map((root) => (
                  <SelectItem key={root.id} value={`root:${root.id}`}>
                    {root.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.features.local.projects.LocalWorkspaceCheckoutDialog.fae505d00d',
              'Save or discard unsaved edits and close running terminals and agents in this Workspace before changing these choices. Other Workspaces keep their checkout choices.'
            )}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>
              {translate(
                'auto.features.local.projects.LocalWorkspaceCheckoutDialog.e12d21ef1f',
                'Cancel'
              )}
            </Button>
            <Button type="submit" disabled={disabled}>
              {busy
                ? translate(
                    'auto.features.local.projects.LocalWorkspaceCheckoutDialog.5ec9c90086',
                    'Saving…'
                  )
                : translate(
                    'auto.features.local.projects.LocalWorkspaceCheckoutDialog.1f578c0418',
                    'Save checkouts'
                  )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
