import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { LocalWorkspaceLinearIssue } from '../../../../shared/local-projects/linear-issues'
import {
  LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT,
  useLocalWorkspaceLinearSearch
} from './use-local-workspace-linear-search'
import { translate } from '@/i18n/i18n'

export function LocalWorkspaceLinearIssuePicker({
  links,
  disabled,
  onAttach,
  onSettings
}: {
  links: readonly LocalWorkspaceLinearIssue[]
  disabled: boolean
  onAttach: (linearWorkspaceId: string, issueId: string) => void
  onSettings: () => void
}): React.JSX.Element {
  const search = useLocalWorkspaceLinearSearch()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.8306c684bb',
            'Uses Linear access on this device.'
          )}
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={search.refresh}
          disabled={disabled || search.statusLoading}
        >
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.b6faeb01f6',
            'Refresh issues'
          )}
        </Button>
      </div>
      {search.statusLoading && (
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.430d2a773e',
            'Checking Linear access…'
          )}
        </p>
      )}
      {search.statusError && (
        <p role="alert" className="text-xs text-destructive">
          {search.statusError}
        </p>
      )}
      {!search.statusLoading && search.accounts.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.9d62f1b6a0',
              'Connect a local Linear account to link issues. Saved links remain available.'
            )}
          </p>
          <Button variant="outline" size="sm" onClick={onSettings}>
            {translate(
              'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.5c0ac79bcb',
              'Open Linear settings'
            )}
          </Button>
        </div>
      )}
      {search.accounts.length > 0 && (
        <>
          <div className="space-y-1">
            <Label>
              {translate(
                'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.e5b927d933',
                'Linear account'
              )}
            </Label>
            <Select
              value={search.accountId}
              onValueChange={search.setAccountId}
              disabled={disabled}
            >
              <SelectTrigger
                aria-label={translate(
                  'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.e5b927d933',
                  'Linear account'
                )}
                className="w-full"
              >
                <SelectValue
                  placeholder={translate(
                    'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.5461af67b1',
                    'Choose an account'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {search.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.organizationName} · {account.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              placeholder={translate(
                'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.29a4286a94',
                'Search Linear issues…'
              )}
              aria-label={translate(
                'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.779136fd9c',
                'Search by title, issue identifier, or Linear URL'
              )}
              value={search.query}
              onValueChange={search.setQuery}
              disabled={disabled || !search.account}
              maxLength={512}
            />
            <CommandList
              aria-label={translate(
                'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.b5c186ea24',
                'Linear issue results'
              )}
            >
              {search.issues.map((issue) => {
                const linked = links.some(
                  (link) =>
                    link.organizationId === search.account?.organizationId &&
                    link.issueId === issue.id
                )
                return (
                  <CommandItem
                    key={issue.id}
                    value={issue.id}
                    className="jump-palette-item"
                    disabled={disabled || linked}
                    onSelect={() => onAttach(search.accountId, issue.id)}
                  >
                    {linked && <Check />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">
                        {issue.identifier} · {issue.state.name}
                        {linked
                          ? translate(
                              'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.6edee8b286',
                              '· Linked'
                            )
                          : ''}
                      </span>
                      <span className="block truncate">{issue.title}</span>
                    </span>
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
          {search.searchError ? (
            <p role="alert" className="text-xs text-destructive">
              {search.searchError}
            </p>
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              {!search.account
                ? translate(
                    'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.9f1f5903af',
                    'Choose a Linear account.'
                  )
                : search.query.trim().length < 2
                  ? translate(
                      'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.c1025ce8b3',
                      'Enter at least two characters, an issue identifier, or a Linear URL.'
                    )
                  : search.searching
                    ? translate(
                        'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.bc6c39f45a',
                        'Searching Linear…'
                      )
                    : search.issues.length === 0
                      ? translate(
                          'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.69f46c1507',
                          'No issues returned. Try another search or check the connection.'
                        )
                      : translate(
                          'auto.features.local.projects.LocalWorkspaceLinearIssuePicker.f54b50de50',
                          'Showing up to {{value0}} results. Select issues to link them.',
                          { value0: LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT }
                        )}
            </p>
          )}
        </>
      )}
    </div>
  )
}
