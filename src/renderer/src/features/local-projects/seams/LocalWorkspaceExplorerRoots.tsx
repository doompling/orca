import React from 'react'
import type { LocalProjectRoot } from '../../../../../shared/local-projects/types'
import { useActiveLocalWorkspace } from '../use-active-local-workspace'
import { LocalWorkspaceRootBar } from '../LocalWorkspaceRootBar'

/** Explorer frame for a multi-root Workspace: a root bar above a tree scoped to the chosen root.
 *  Any other workspace renders `children(undefined)` unchanged. */
export function LocalWorkspaceExplorerRoots({
  children
}: {
  children: (root: LocalProjectRoot | undefined) => React.ReactNode
}): React.JSX.Element {
  const context = useActiveLocalWorkspace()
  const [selectedRootId, setSelectedRootId] = React.useState<string | null>(null)
  const root =
    context?.roots.find((entry) => entry.id === selectedRootId) ??
    context?.roots.find((entry) => entry.id === context.defaultRootId)
  return (
    <>
      {context && root && (
        <LocalWorkspaceRootBar
          context={context}
          selectedRootId={root.id}
          onSelect={setSelectedRootId}
        />
      )}
      {children(root)}
    </>
  )
}
