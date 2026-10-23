import { useEffect, useState } from 'react'
import { Bookmark } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { useNow } from '@/hooks/use-now'
import { LocalSidebarWorkspaceRow } from './LocalSidebarWorkspaceRow'
import { useLocalSidebarModel } from './LocalProjectsSidebar'
import { requestLocalWorkspaceMarksList } from './local-workspace-sidebar-actions'
import { translate } from '@/i18n/i18n'

const MARKS_INTRODUCED_KEY = 'ether.sidebar.marksIntroduced'

function readMarksIntroduced(): boolean {
  try {
    return window.localStorage.getItem(MARKS_INTRODUCED_KEY) === '1'
  } catch {
    return false
  }
}

function writeMarksIntroduced(): void {
  try {
    window.localStorage.setItem(MARKS_INTRODUCED_KEY, '1')
  } catch {
    // Storage can be unavailable; the hint simply shows again next launch.
  }
}

/** Pinned above the scrolling Projects list so marked Workspaces stay in view. */
export function LocalSidebarMarks(): React.JSX.Element | null {
  const { marks } = useLocalSidebarModel(false)
  const now = useNow(30_000, marks.length > 0)
  const listShortcut = useOptionalShortcutLabel('workspace.showMarks')
  const markShortcut = useOptionalShortcutLabel('workspace.toggleMark')
  const jumpShortcut = useOptionalShortcutLabel('workspace.selectByIndex')
  const hasLocalWorkspaceOpen = useAppStore(
    (s) => s.activeWorktreeId?.startsWith('folder:') ?? false
  )
  // Teach the shortcut once; after the first mark an empty Marks list stays out of the way.
  const [introduced, setIntroduced] = useState(() => readMarksIntroduced())
  useEffect(() => {
    if (marks.length > 0 && !introduced) {
      writeMarksIntroduced()
      setIntroduced(true)
    }
  }, [marks.length, introduced])
  if (marks.length === 0) {
    return introduced || !markShortcut || !hasLocalWorkspaceOpen ? null : (
      <p className="mx-4 mt-2 shrink-0 text-xs text-muted-foreground">
        {markShortcut}{' '}
        {translate(
          'auto.features.local.projects.LocalSidebarMarks.3332414ac6',
          'marks the open Workspace'
        )}
        {jumpShortcut
          ? translate(
              'auto.features.local.projects.LocalSidebarMarks.f13ea2ec47',
              '; {{value0}} jumps to a mark',
              { value0: jumpShortcut.replace(/1$/, '1–9') }
            )
          : ''}
        .
      </p>
    )
  }
  return (
    <div className="flex max-h-[35%] shrink-0 flex-col border-b border-worktree-sidebar-border pb-1">
      <div className="mt-2 flex h-8 items-center justify-between px-2">
        <span className="select-none pl-2 text-xs font-semibold text-muted-foreground/80">
          {translate('auto.features.local.projects.LocalSidebarMarks.1b498dd9c2', 'Marks')}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={translate(
                'auto.features.local.projects.LocalSidebarMarks.fca1536727',
                'Edit marks'
              )}
              onClick={requestLocalWorkspaceMarksList}
            >
              <Bookmark className="size-3.5" strokeWidth={2.25} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.features.local.projects.LocalSidebarMarks.fca1536727', 'Edit marks')}
            {listShortcut ? (
              <span className="ml-1.5 text-background/60">{listShortcut}</span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>
      <ul
        className="min-h-0 space-y-px overflow-y-auto px-2 scrollbar-sleek"
        aria-label={translate('auto.features.local.projects.LocalSidebarMarks.1b498dd9c2', 'Marks')}
      >
        {marks.map((row) => (
          <LocalSidebarWorkspaceRow key={row.workspace.id} row={row} now={now} showProjectName />
        ))}
      </ul>
    </div>
  )
}
