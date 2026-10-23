import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'
import type { CreateLocalRootWorktreeResult } from '../../../../shared/local-projects/worktree-creation'
import { translate } from '@/i18n/i18n'

export function LocalRootWorktreeCreation({
  projectId,
  root,
  disabled,
  onBusyChange,
  onCreated
}: {
  projectId: string
  root: LocalProjectRoot
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onCreated: (path: string) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateLocalRootWorktreeResult | null>(null)
  const currentSource = useRef({ projectId, root })
  currentSource.current = { projectId, root }

  const create = async () => {
    if (disabled || busy || created) {
      return
    }
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const result = await window.api.localProjects.createRootWorktree({
        projectId,
        rootId: root.id,
        expectedRootPath: root.path,
        branchName: branchName.trim(),
        path: path.trim()
      })
      setCreated(result)
      const current = currentSource.current
      if (
        current.projectId === result.projectId &&
        current.root.id === result.rootId &&
        current.root.path === result.sourcePath
      ) {
        onCreated(result.path)
      } else {
        setError(
          'The Project directory changed. Reopen the form and select the created worktree by its path.'
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {translate('localProjects.worktreeCreation.toggle', 'Create new worktree for {{label}}', {
          label: root.label
        })}
      </Button>
      {expanded && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.features.local.projects.LocalRootWorktreeCreation.7db5cec376',
              "Creates a new branch from this Project checkout's current committed HEAD:"
            )}{' '}
            {root.path}
            {translate(
              'auto.features.local.projects.LocalRootWorktreeCreation.787c2285d5',
              '. It does not start from a Workspace alternate or copy uncommitted edits. No Orca setup or agent is started.'
            )}
          </p>
          {!created && (
            <>
              <Label htmlFor={`local-new-branch-${root.id}`}>
                {root.label}{' '}
                {translate(
                  'auto.features.local.projects.LocalRootWorktreeCreation.4f7b921cbf',
                  'new branch'
                )}
              </Label>
              <Input
                id={`local-new-branch-${root.id}`}
                value={branchName}
                disabled={disabled}
                onChange={(event) => setBranchName(event.target.value)}
              />
              <Label htmlFor={`local-new-path-${root.id}`}>
                {root.label}{' '}
                {translate(
                  'auto.features.local.projects.LocalRootWorktreeCreation.baf9dd60b9',
                  'new worktree directory'
                )}
              </Label>
              <Input
                id={`local-new-path-${root.id}`}
                value={path}
                disabled={disabled}
                onChange={(event) => setPath(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.features.local.projects.LocalRootWorktreeCreation.bdd267726d',
                  'Use an absolute path that does not exist, inside an existing local directory. Creating a worktree does not save the Workspace. Cancelling later leaves it on disk.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !branchName.trim() || !path.trim()}
                onClick={() => void create()}
              >
                {busy
                  ? translate(
                      'auto.features.local.projects.LocalRootWorktreeCreation.62769c7775',
                      'Creating worktree…'
                    )
                  : translate(
                      'auto.features.local.projects.LocalRootWorktreeCreation.b91a580eab',
                      'Create worktree'
                    )}
              </Button>
            </>
          )}
        </div>
      )}
      {created && (
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            'localProjects.worktreeCreation.created',
            'Created branch {{branch}} at {{path}}. Save the Workspace to use it. Cancelling or a failed save leaves this worktree intact; select its path as an existing worktree to use it later.',
            { branch: created.branchName, path: created.path }
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
