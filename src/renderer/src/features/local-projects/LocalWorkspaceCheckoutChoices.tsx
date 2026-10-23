import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'
import { LocalRootWorktreeCreation } from './LocalRootWorktreeCreation'
import { translate } from '@/i18n/i18n'

export function LocalWorkspaceCheckoutChoices({
  projectId,
  roots,
  overrides,
  onChange,
  disabled,
  onBusyChange,
  initiallyExpanded = false
}: {
  projectId: string
  roots: LocalProjectRoot[]
  overrides: Record<string, string>
  onChange: (overrides: Record<string, string>) => void
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  initiallyExpanded?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={disabled}>
          <ChevronRight />
          {translate(
            'auto.features.local.projects.LocalWorkspaceCheckoutChoices.fab9cd3c2c',
            'Choose worktrees'
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-3">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.features.local.projects.LocalWorkspaceCheckoutChoices.bcc7ee06d6',
              "Optional: select an existing worktree or explicitly create a new one for a Git directory. Leave a path empty to share the Project's directory. Plain folders remain shared."
            )}
          </p>
          {roots.map((root) => (
            <div key={root.id} className="space-y-1">
              <Label htmlFor={`local-worktree-${root.id}`}>
                {root.label}{' '}
                {translate(
                  'auto.features.local.projects.LocalWorkspaceCheckoutChoices.0440338700',
                  'existing worktree path'
                )}
              </Label>
              <Input
                id={`local-worktree-${root.id}`}
                value={overrides[root.id] ?? ''}
                placeholder={root.path}
                disabled={disabled}
                onChange={(event) => onChange({ ...overrides, [root.id]: event.target.value })}
              />
              <LocalRootWorktreeCreation
                projectId={projectId}
                root={root}
                disabled={disabled}
                onBusyChange={onBusyChange}
                onCreated={(path) => onChange({ ...overrides, [root.id]: path })}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
