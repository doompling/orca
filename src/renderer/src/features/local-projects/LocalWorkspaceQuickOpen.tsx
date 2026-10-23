import { useDeferredValue, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { prepareQuickOpenFiles, rankQuickOpenFiles } from '@/components/quick-open-search'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { useModalReturnFocus } from '@/hooks/useModalReturnFocus'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { LocalWorkspaceRootContext } from './root-scope'
import type {
  LocalProjectRoot,
  ResolvedLocalWorkspace
} from '../../../../shared/local-projects/types'
import { translate } from '@/i18n/i18n'

function RootFileMatches({
  root,
  workspaceKey,
  query,
  onSelect
}: {
  root: LocalProjectRoot
  workspaceKey: string
  query: string
  onSelect: (root: LocalProjectRoot, relativePath: string) => void
}): React.JSX.Element {
  const listing = useRuntimeFileListForWorktree({
    enabled: true,
    worktreeId: workspaceKey,
    query,
    hostFilterWhenCapped: true
  })
  const indexed = useMemo(() => prepareQuickOpenFiles(listing.files), [listing.files])
  const matches = useMemo(() => rankQuickOpenFiles(query, indexed), [query, indexed])
  return (
    <CommandGroup heading={root.label}>
      {listing.loading && (
        <p className="p-2 text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceQuickOpen.e0522ef1f5',
            'Loading files…'
          )}
        </p>
      )}
      {listing.loadError && (
        <p role="alert" className="p-2 text-xs text-destructive">
          {root.label}: {listing.loadError}
        </p>
      )}
      {!listing.loading && !listing.loadError && matches.length === 0 && (
        <p className="p-2 text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceQuickOpen.28e9b55970',
            'No matching files.'
          )}
        </p>
      )}
      {matches.map((match) => (
        <CommandItem
          key={match.path}
          value={`${root.id}:${match.path}`}
          onSelect={() => onSelect(root, match.path)}
        >
          <span className="truncate">
            {root.label} / {match.path}
          </span>
        </CommandItem>
      ))}
      {listing.truncated && (
        <p className="p-2 text-xs text-muted-foreground">
          {translate(
            'auto.features.local.projects.LocalWorkspaceQuickOpen.5d0076a5c7',
            'More files are available. Refine your search.'
          )}
        </p>
      )}
    </CommandGroup>
  )
}

export function LocalWorkspaceQuickOpen({
  context
}: {
  context: ResolvedLocalWorkspace
}): React.JSX.Element {
  const closeModal = useAppStore((state) => state.closeModal)
  const openFile = useAppStore((state) => state.openFile)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { captureReturnFocus, skipReturnFocus } = useModalReturnFocus(true)
  const workspaceKey = `folder:${context.workspaceId}`
  const selectFile = (root: LocalProjectRoot, relativePath: string) => {
    skipReturnFocus()
    openFile(
      {
        filePath: joinPath(root.path, relativePath),
        relativePath,
        worktreeId: workspaceKey,
        language: detectLanguage(relativePath),
        mode: 'edit'
      },
      { suppressActiveRuntimeFallback: true, focusEditor: true }
    )
    closeModal()
  }
  return (
    <CommandDialog
      open
      shouldFilter={false}
      title={translate(
        'auto.features.local.projects.LocalWorkspaceQuickOpen.667629d829',
        'Go to file'
      )}
      description={translate(
        'auto.features.local.projects.LocalWorkspaceQuickOpen.d6b2404e64',
        'Search every directory in this Workspace'
      )}
      onOpenChange={(open) => {
        if (!open) {
          closeModal()
        }
      }}
      onOpenAutoFocus={captureReturnFocus}
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={translate(
          'auto.features.local.projects.LocalWorkspaceQuickOpen.e94018d4ff',
          'Search files in all directories…'
        )}
      />
      <CommandList>
        {context.roots.map((root) => (
          <LocalWorkspaceRootContext.Provider key={root.id} value={root}>
            <RootFileMatches
              root={root}
              workspaceKey={workspaceKey}
              query={deferredQuery}
              onSelect={selectFile}
            />
          </LocalWorkspaceRootContext.Provider>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
