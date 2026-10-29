import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { useLocalLinearIssueWorkspaces } from './use-local-linear-issue-workspaces'
import { translate } from '@/i18n/i18n'

/** Replaces the issue details Workspace card when local Workspaces link the issue. */
export function LocalIssueWorkspaceLinks({
  issue,
  sourceContext
}: {
  issue: LinearIssue
  sourceContext?: TaskSourceContext | null
}): React.JSX.Element | null {
  const { account, attached } = useLocalLinearIssueWorkspaces(issue, sourceContext)
  const activate = useAppStore((state) => state.activateLocalWorkspace)
  const [error, setError] = useState<string | null>(null)
  if (!account || attached.length === 0) {
    return null
  }
  return (
    <section
      aria-label={translate(
        'auto.features.local.projects.LocalIssueWorkspaceLinks.0c7d222f2e',
        'Linked Workspaces'
      )}
      // Why: rendered just before the upstream Workspace card it replaces, so upstream JSX stays untouched.
      className="space-y-2 [&+*]:hidden!"
    >
      <h3 className="text-sm font-medium">
        {translate(
          'auto.features.local.projects.LocalIssueWorkspaceLinks.34febc4d86',
          'Workspaces'
        )}
      </h3>
      {attached.map(({ workspace, label }) => (
        <Button
          key={workspace.id}
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null)
            void activate(workspace.id).catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause))
            })
          }}
        >
          <FolderOpen />
          {label}
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
