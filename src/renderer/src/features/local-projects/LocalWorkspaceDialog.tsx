import { useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { LocalWorkspaceCheckoutChoices } from './LocalWorkspaceCheckoutChoices'
import NewWorkspaceComposerModal from '@/components/NewWorkspaceComposerModal'
import {
  localWorkspaceComposerIssueLabel,
  readLocalWorkspaceComposerIssue,
  usesLocalWorkspaceComposer
} from './local-workspace-composer-intent'

export function LocalWorkspaceDialog(): React.JSX.Element {
  const modalData = useAppStore((s) => s.modalData)
  const activeRuntimeEnvironmentId = useAppStore((s) => s.settings?.activeRuntimeEnvironmentId)
  return usesLocalWorkspaceComposer(modalData, activeRuntimeEnvironmentId) ? (
    <LocalWorkspaceForm />
  ) : (
    <NewWorkspaceComposerModal />
  )
}

function LocalWorkspaceForm(): React.JSX.Element {
  const catalog = useAppStore((s) => s.localProjects)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const createWorkspace = useAppStore((s) => s.createLocalWorkspace)
  const projects = catalog.projects.filter((entry) => !entry.isArchived)
  const activeWorkspace = catalog.workspaces.find(
    (entry) => `folder:${entry.id}` === activeWorktreeId
  )
  const [projectId, setProjectId] = useState(
    typeof modalData.localProjectId === 'string'
      ? modalData.localProjectId
      : (activeWorkspace?.projectId ?? projects[0]?.id ?? '')
  )
  const [name, setName] = useState(
    typeof modalData.prefilledName === 'string' ? modalData.prefilledName : ''
  )
  const linearIssue = readLocalWorkspaceComposerIssue(modalData)
  const issueLabel = localWorkspaceComposerIssueLabel(modalData)
  const submitting = useRef(false)
  const [copySource, setCopySource] = useState('none')
  const [checkoutOverrides, setCheckoutOverrides] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [creatingWorktree, setCreatingWorktree] = useState(false)
  const disabled = busy || creatingWorktree
  const [error, setError] = useState<string | null>(null)
  const project = projects.find((entry) => entry.id === projectId)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (disabled || submitting.current) {
      return
    }
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const checkoutOverridesByRootId = Object.fromEntries(
        Object.entries(checkoutOverrides)
          .map(([rootId, path]) => [rootId, path.trim()])
          .filter(([, path]) => path)
      )
      const args = {
        projectId,
        name,
        checkoutOverridesByRootId,
        ...(linearIssue ? { linearIssue } : {})
      }
      await (copySource === 'none'
        ? createWorkspace(args)
        : createWorkspace(args, { copyFileLayoutFromWorkspaceId: copySource }))
      closeModal()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) {
          closeModal()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogDescription>
            A separate set of tabs, drafts, and sessions over your Project&apos;s directories.
          </DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm">Create a Project to choose your directories first.</p>
            <Button onClick={() => openModal('add-repo', { workspaceComposerIntent: modalData })}>
              New Project
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {issueLabel && (
              <p className="text-sm" role="status">
                Link {issueLabel}. The issue will be verified before this Workspace is created.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="local-workspace-project">Project</Label>
              <Select
                value={projectId}
                onValueChange={(id) => {
                  setProjectId(id)
                  setCheckoutOverrides({})
                  setCopySource('none')
                }}
                disabled={disabled}
              >
                <SelectTrigger id="local-workspace-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-workspace-copy-files">Copy saved file tabs from</Label>
              <Select value={copySource} onValueChange={setCopySource} disabled={disabled}>
                <SelectTrigger id="local-workspace-copy-files">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Do not copy</SelectItem>
                  {catalog.workspaces
                    .filter(
                      (workspace) => workspace.projectId === projectId && !workspace.isArchived
                    )
                    .map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {copySource !== 'none' && (
                <p className="text-xs text-muted-foreground">
                  Copies clean saved file tabs and their split arrangement. Unsaved edits, previews,
                  terminals, agents, browsers, and transient tabs are excluded. Files keep their
                  physical paths; tabs outside the new Workspace&apos;s directories are excluded,
                  not moved to an alternate checkout.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-workspace-name">Workspace name</Label>
              <Input
                id="local-workspace-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={disabled}
              />
            </div>
            <ul
              className="space-y-1 text-xs text-muted-foreground"
              aria-label="Workspace directories"
            >
              {project?.roots.map((root) => (
                <li key={root.id} className="truncate" title={root.path}>
                  {root.label} — {root.path}
                </li>
              ))}
            </ul>
            {project && (
              <LocalWorkspaceCheckoutChoices
                key={project.id}
                projectId={project.id}
                roots={project.roots}
                overrides={checkoutOverrides}
                onChange={setCheckoutOverrides}
                disabled={disabled}
                onBusyChange={setCreatingWorktree}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Directories without an alternate worktree share files and branches.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={disabled} onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={disabled || !name.trim() || !project}>
                {busy ? 'Creating…' : 'Create Workspace'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
