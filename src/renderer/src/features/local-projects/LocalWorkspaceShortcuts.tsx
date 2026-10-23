import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getShortcutPlatform } from '@/hooks/useShortcutLabel'
import { getKeybindingContext } from '@/app-shell/app-command-handlers'
import { keybindingMatchesAction, type KeybindingActionId } from '../../../../shared/keybindings'
import { LocalWorkspaceLinearIssuesContent } from './LocalWorkspaceLinearIssues'
import { LocalWorkspaceMarksDialog } from './LocalWorkspaceMarksDialog'
import { LocalWorkspaceRecentSwitcher } from './LocalWorkspaceRecentSwitcher'
import {
  activeLocalWorkspaceId,
  onLocalWorkspaceLinearIssuesRequest,
  onLocalWorkspaceMarksListRequest,
  toggleLocalWorkspaceMark
} from './local-workspace-sidebar-actions'
import { translate } from '@/i18n/i18n'

function matches(actionId: KeybindingActionId, event: KeyboardEvent): boolean {
  const state = useAppStore.getState()
  return keybindingMatchesAction(actionId, event, getShortcutPlatform(), state.keybindings, {
    context: getKeybindingContext(event.target),
    terminalShortcutPolicy: state.settings?.terminalShortcutPolicy
  })
}

/** Ether fork: mark, marks-list, recent-switch, and Linear-issue surfaces for local Workspaces. */
export function LocalWorkspaceShortcuts(): React.JSX.Element {
  const [marksOpen, setMarksOpen] = useState(false)
  const [linearWorkspaceId, setLinearWorkspaceId] = useState<string | null>(null)
  const profileId = useAppStore((s) => s.activeOrcaProfileId)
  const linearWorkspaceName = useAppStore(
    (s) => s.localProjects.workspaces.find((entry) => entry.id === linearWorkspaceId)?.name
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) {
        return
      }
      // The Settings shortcut recorder must capture chords instead of running them.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-shortcut-recorder-active]') !== null
      ) {
        return
      }
      if (matches('workspace.toggleMark', event)) {
        const workspaceId = activeLocalWorkspaceId()
        if (workspaceId) {
          event.preventDefault()
          void toggleLocalWorkspaceMark(workspaceId)
        }
        return
      }
      if (matches('workspace.showMarks', event)) {
        event.preventDefault()
        setMarksOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    const offMarks = onLocalWorkspaceMarksListRequest(() => setMarksOpen(true))
    const offLinear = onLocalWorkspaceLinearIssuesRequest(setLinearWorkspaceId)
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      offMarks()
      offLinear()
    }
  }, [])

  const closeLinear = useCallback(() => setLinearWorkspaceId(null), [])

  return (
    <>
      <LocalWorkspaceRecentSwitcher />
      <LocalWorkspaceMarksDialog open={marksOpen} onOpenChange={setMarksOpen} />
      <Dialog open={linearWorkspaceId !== null} onOpenChange={(open) => !open && closeLinear()}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">
            {translate('localProjects.shortcuts.linearTitle', 'Linear issues for {{name}}', {
              name: linearWorkspaceName ?? ''
            })}
          </DialogTitle>
          {linearWorkspaceId ? (
            <LocalWorkspaceLinearIssuesContent
              key={`${profileId}:${linearWorkspaceId}`}
              workspaceId={linearWorkspaceId}
              onClose={closeLinear}
              padded={false}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
