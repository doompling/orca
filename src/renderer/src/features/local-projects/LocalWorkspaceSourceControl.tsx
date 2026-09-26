import { useState } from 'react'
import { GitBranch, RefreshCw } from 'lucide-react'
import { branchName } from '@/lib/git-utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ActionButton } from '@/components/right-sidebar/source-control/listing/action-button'
import { CommitMessageComposer } from '@/components/right-sidebar/source-control/commit/commit-message-composer'
import {
  readCommitDraftForWorktree,
  writeCommitDraftForWorktree
} from '@/components/right-sidebar/source-control/commit/commit-drafts'
import type {
  LocalProjectRoot,
  ResolvedLocalWorkspace
} from '../../../../shared/local-projects/types'
import { useLocalRootGit } from './use-local-root-git'
import { LocalRootGitChanges } from './LocalRootGitChanges'

function RootGitPanel({
  workspaceId,
  root,
  message,
  setMessage
}: {
  workspaceId: string
  root: LocalProjectRoot
  message: string
  setMessage: (value: string) => void
}) {
  const git = useLocalRootGit(workspaceId, root)
  const hasStaged = git.status?.entries.some((entry) => entry.area === 'staged')
  const conflicts = git.status?.entries.some((entry) => entry.conflictStatus === 'unresolved')
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <GitBranch className="size-4" />
        <span className="min-w-0 flex-1 truncate">
          {git.status
            ? branchName(git.status.branch ?? '') ||
              (git.status.head ? `Detached ${git.status.head.slice(0, 8)}` : 'Unborn branch')
            : 'Git status'}
        </span>
        <ActionButton
          icon={RefreshCw}
          title="Refresh Git status"
          disabled={git.busy}
          onClick={() => {
            void git.refresh()
          }}
        />
      </div>
      {git.error && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {git.error}
        </p>
      )}
      {!git.status && !git.error && (
        <p className="px-3 text-xs text-muted-foreground">Reading Git status…</p>
      )}
      {git.status && (
        <>
          {git.status.didHitLimit && (
            <p className="px-3 text-xs text-muted-foreground">
              Only part of this root’s changes could be listed. Commit is unavailable.
            </p>
          )}
          {conflicts && (
            <p className="px-3 text-xs text-muted-foreground">
              Resolve conflicts in this checkout before committing.
            </p>
          )}
          <div className="space-y-2 border-b border-border px-3 pb-3">
            <p className="text-xs font-medium">Commit message</p>
            <CommitMessageComposer
              rows={3}
              commitMessage={message}
              onCommitMessageChange={setMessage}
              disabled={git.busy}
              describedBy="local-root-commit-help"
              showGenerate={false}
              isGenerating={false}
              isGenerateDisabled
              onGenerate={() => {}}
              onCancelGenerate={() => {}}
            />
            <p id="local-root-commit-help" className="text-xs text-muted-foreground">
              Commits staged changes in {root.label} only.
            </p>
            <Button
              size="sm"
              disabled={
                git.busy || !hasStaged || !message.trim() || conflicts || git.status.didHitLimit
              }
              onClick={() => {
                void git.commit(message).then((ok) => {
                  if (ok) {
                    setMessage('')
                  }
                })
              }}
            >
              {git.busy ? 'Working…' : 'Commit staged changes'}
            </Button>
          </div>
          {!git.status.entries.length && (
            <p className="p-3 text-xs text-muted-foreground">No changes in this root.</p>
          )}
          <LocalRootGitChanges
            workspaceId={workspaceId}
            root={root}
            entries={git.status.entries}
            busy={git.busy}
            stage={git.stage}
            unstage={git.unstage}
          />
        </>
      )}
    </>
  )
}

export function LocalWorkspaceSourceControl({ workspace }: { workspace: ResolvedLocalWorkspace }) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const root = workspace.roots.find(
    (entry) => entry.id === (selected[workspace.workspaceId] ?? workspace.defaultRootId)
  )
  if (!root) {
    return <p className="p-3 text-xs text-muted-foreground">Workspace root unavailable.</p>
  }
  const targetKey = JSON.stringify([workspace.workspaceId, root.id, root.path])
  return (
    <div
      className="min-h-0 flex-1 overflow-auto scrollbar-sleek"
      aria-label="Workspace Source Control"
    >
      <div className="space-y-2 border-b border-border p-3">
        <Label htmlFor="local-git-root">Git directory</Label>
        <Select
          value={root.id}
          onValueChange={(id) =>
            setSelected((value) => ({ ...value, [workspace.workspaceId]: id }))
          }
        >
          <SelectTrigger id="local-git-root">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspace.roots.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="truncate text-xs text-muted-foreground" title={root.path}>
          {root.path}
        </p>
      </div>
      <RootGitPanel
        key={targetKey}
        workspaceId={workspace.workspaceId}
        root={root}
        message={readCommitDraftForWorktree(drafts, targetKey)}
        setMessage={(value) =>
          setDrafts((current) => writeCommitDraftForWorktree(current, targetKey, value))
        }
      />
    </div>
  )
}
