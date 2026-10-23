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
import { translate } from '@/i18n/i18n'

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
          <DialogTitle>
            {original
              ? translate(
                  'auto.features.local.projects.LocalProjectDialog.284599def7',
                  'Edit Project roots'
                )
              : translate(
                  'auto.features.local.projects.LocalProjectDialog.3d057c670f',
                  'New Project'
                )}
          </DialogTitle>
          <DialogDescription>
            {original
              ? translate(
                  'auto.features.local.projects.LocalProjectDialog.7b73a0bcfc',
                  'Directories for {{value0}}. Clean tabs outside the new directories will close. Files stay where they are.',
                  { value0: original.name }
                )
              : translate(
                  'auto.features.local.projects.LocalProjectDialog.fea2007f79',
                  'Choose the existing directories that belong together. Files stay where they are.'
                )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!original && (
            <div className="space-y-2">
              <Label htmlFor="local-project-name">
                {translate(
                  'auto.features.local.projects.LocalProjectDialog.b2ee617f70',
                  'Project name'
                )}
              </Label>
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
              {translate(
                'auto.features.local.projects.LocalProjectDialog.93549fc86f',
                'Changing directories or the default requires all affected Workspaces to have no unsaved edits or running sessions. Labels and order can change at any time. Removing a directory also removes its Workspace checkout choices; a removed Workspace default will inherit the selected Project default.'
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              {translate('auto.features.local.projects.LocalProjectDialog.3ebb5d7a4e', 'Cancel')}
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
                  ? translate(
                      'auto.features.local.projects.LocalProjectDialog.e7c430ff61',
                      'Saving…'
                    )
                  : translate(
                      'auto.features.local.projects.LocalProjectDialog.d943359ab7',
                      'Creating…'
                    )
                : original
                  ? translate(
                      'auto.features.local.projects.LocalProjectDialog.103291f36d',
                      'Save roots'
                    )
                  : translate(
                      'auto.features.local.projects.LocalProjectDialog.f76ce54b0c',
                      'Create Project'
                    )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
