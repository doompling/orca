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
import { translate } from '@/i18n/i18n'

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
              (git.status.head
                ? translate(
                    'auto.features.local.projects.LocalWorkspaceSourceControl.173cd1c58b',
                    'Detached {{value0}}',
                    { value0: git.status.head.slice(0, 8) }
                  )
                : translate(
                    'auto.features.local.projects.LocalWorkspaceSourceControl.831b0df7ae',
                    'Unborn branch'
                  ))
            : translate(
                'auto.features.local.projects.LocalWorkspaceSourceControl.0fff044cb8',
                'Git status'
              )}
        </span>
        <ActionButton
          icon={RefreshCw}
          title={translate(
            'auto.features.local.projects.LocalWorkspaceSourceControl.3aa8114bf1',
            'Refresh Git status'
          )}
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
        <p className="px-3 text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceSourceControl.f2e15aeced',
            'Reading Git status…'
          )}
        </p>
      )}
      {git.status && (
        <>
          {git.status.didHitLimit && (
            <p className="px-3 text-xs text-muted-foreground">
              {translate(
                'auto.features.local.projects.LocalWorkspaceSourceControl.1de452884a',
                'Only part of this root’s changes could be listed. Commit is unavailable.'
              )}
            </p>
          )}
          {conflicts && (
            <p className="px-3 text-xs text-muted-foreground">
              {translate(
                'auto.features.local.projects.LocalWorkspaceSourceControl.c76147ca01',
                'Resolve conflicts in this checkout before committing.'
              )}
            </p>
          )}
          <div className="space-y-2 border-b border-border px-3 pb-3">
            <p className="text-xs font-medium">
              {translate(
                'auto.features.local.projects.LocalWorkspaceSourceControl.ce213ef8cd',
                'Commit message'
              )}
            </p>
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
              {translate(
                'localProjects.sourceControl.commitHelp',
                'Commits staged changes in {{label}} only.',
                { label: root.label }
              )}
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
              {git.busy
                ? translate(
                    'auto.features.local.projects.LocalWorkspaceSourceControl.c02019c36c',
                    'Working…'
                  )
                : translate(
                    'auto.features.local.projects.LocalWorkspaceSourceControl.499b07ab73',
                    'Commit staged changes'
                  )}
            </Button>
          </div>
          {!git.status.entries.length && (
            <p className="p-3 text-xs text-muted-foreground">
              {translate(
                'auto.features.local.projects.LocalWorkspaceSourceControl.903a0515db',
                'No changes in this root.'
              )}
            </p>
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
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {translate(
          'auto.features.local.projects.LocalWorkspaceSourceControl.6debb50136',
          'Workspace root unavailable.'
        )}
      </p>
    )
  }
  const targetKey = JSON.stringify([workspace.workspaceId, root.id, root.path])
  return (
    <div
      className="min-h-0 flex-1 overflow-auto scrollbar-sleek"
      aria-label={translate(
        'auto.features.local.projects.LocalWorkspaceSourceControl.6576350164',
        'Workspace Source Control'
      )}
    >
      <div className="space-y-2 border-b border-border p-3">
        <Label htmlFor="local-git-root">
          {translate(
            'auto.features.local.projects.LocalWorkspaceSourceControl.9f3ef03278',
            'Git directory'
          )}
        </Label>
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
