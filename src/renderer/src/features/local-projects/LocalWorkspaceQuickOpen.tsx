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
import type {
  LocalProjectRoot,
  ResolvedLocalWorkspace
} from '../../../../shared/local-projects/types'

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
    rootPath: root.path,
    query,
    hostFilterWhenCapped: true
  })
  const indexed = useMemo(() => prepareQuickOpenFiles(listing.files), [listing.files])
  const matches = useMemo(() => rankQuickOpenFiles(query, indexed), [query, indexed])
  return (
    <CommandGroup heading={root.label}>
      {listing.loading && <p className="p-2 text-xs text-muted-foreground">Loading files…</p>}
      {listing.loadError && (
        <p role="alert" className="p-2 text-xs text-destructive">
          {root.label}: {listing.loadError}
        </p>
      )}
      {!listing.loading && !listing.loadError && matches.length === 0 && (
        <p className="p-2 text-xs text-muted-foreground">No matching files.</p>
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
          More files are available. Refine your search.
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
      title="Go to file"
      description="Search every directory in this Workspace"
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
        placeholder="Search files in all directories…"
      />
      <CommandList>
        {context.roots.map((root) => (
          <RootFileMatches
            key={root.id}
            root={root}
            workspaceKey={workspaceKey}
            query={deferredQuery}
            onSelect={selectFile}
          />
        ))}
      </CommandList>
    </CommandDialog>
  )
}
