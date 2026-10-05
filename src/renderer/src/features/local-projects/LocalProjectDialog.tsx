import { useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { LocalProject, LocalProjectRoot } from '../../../../shared/local-projects/types'
import { localProjectRootScope } from '../../../../shared/local-projects/scope-update'
import { LocalProjectRootFields } from './LocalProjectRootFields'

export function LocalProjectDialog({
  project,
  onClose
}: {
  project?: LocalProject
  onClose?: () => void
} = {}): React.JSX.Element {
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const workspaceComposerIntent = useAppStore((s) => s.modalData.workspaceComposerIntent)
  const createProject = useAppStore((s) => s.createLocalProject)
  const updateRoots = useAppStore((s) => s.updateLocalProjectRoots)
  const [original] = useState(() => (project ? structuredClone(project) : null))
  const [name, setName] = useState('')
  const [roots, setRoots] = useState<LocalProjectRoot[]>(original?.roots ?? [])
  const [defaultRootId, setDefaultRootId] = useState(original?.defaultRootId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = onClose ?? closeModal

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await (original
        ? updateRoots({
            projectId: original.id,
            expected: localProjectRootScope(original),
            roots: roots.map((root) => ({
              ...root,
              path: root.path.trim(),
              label: root.label.trim()
            })),
            defaultRootId
          })
        : createProject({ name, roots, defaultRootId }))
      if (!original && workspaceComposerIntent && typeof workspaceComposerIntent === 'object') {
        openModal('new-workspace-composer', { ...workspaceComposerIntent })
      } else {
        close()
      }
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
        if (!open && !busy) {
          close()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{original ? 'Edit Project roots' : 'New Project'}</DialogTitle>
          <DialogDescription>
            {original
              ? `Directories for ${original.name}. Clean tabs outside the new directories will close. Files stay where they are.`
              : 'Choose the existing directories that belong together. Files stay where they are.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!original && (
            <div className="space-y-2">
              <Label htmlFor="local-project-name">Project name</Label>
              <Input
                id="local-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                disabled={busy}
              />
            </div>
          )}
          <LocalProjectRootFields
            roots={roots}
            onRootsChange={setRoots}
            defaultRootId={defaultRootId}
            onDefaultChange={setDefaultRootId}
            disabled={busy}
            onError={setError}
            editing={Boolean(original)}
          />
          {original && (
            <p className="text-xs text-muted-foreground">
              Changing directories or the default requires all affected Workspaces to have no
              unsaved edits or running sessions. Labels and order can change at any time. Removing a
              directory also removes its Workspace checkout choices; a removed Workspace default
              will inherit the selected Project default.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                (!original && !name.trim()) ||
                roots.length === 0 ||
                !defaultRootId ||
                roots.some((root) => !root.path.trim() || !root.label.trim())
              }
            >
              {busy
                ? original
                  ? 'Saving…'
                  : 'Creating…'
                : original
                  ? 'Save roots'
                  : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
