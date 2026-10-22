import { useEffect, useId, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { localWorkspaceMarkSlots } from './local-sidebar-model'
import {
  activeLocalWorkspaceId,
  openLocalWorkspace,
  setLocalWorkspaceMarkSlot
} from './local-workspace-sidebar-actions'

const isMac = navigator.userAgent.includes('Mac')

export function LocalWorkspaceMarksDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const catalog = useAppStore((s) => s.localProjects)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const [selected, setSelected] = useState(0)
  const jumpLabel = useOptionalShortcutLabel('workspace.selectByIndex')
  const listId = useId()
  const slots = localWorkspaceMarkSlots(catalog)

  // Why: Mod+digit still jumps while this is open; close once the Workspace changes underneath.
  const shownFor = useRef(activeWorktreeId)
  useEffect(() => {
    if (shownFor.current !== activeWorktreeId) {
      shownFor.current = activeWorktreeId
      if (open) {
        onOpenChange(false)
      }
    }
  }, [activeWorktreeId, open, onOpenChange])

  const assignOpenWorkspace = (index: number): boolean => {
    const current = activeLocalWorkspaceId()
    if (current) {
      void setLocalWorkspaceMarkSlot(current, index + 1)
    }
    return current !== null
  }

  /** A filled slot opens; an empty one takes the open Workspace. */
  const activateSlot = (index: number) => {
    const workspace = slots[index]?.workspace
    if (workspace) {
      onOpenChange(false)
      openLocalWorkspace(workspace.id)
      return
    }
    assignOpenWorkspace(index)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      activateSlot(Number(digit[1]) - 1)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.max(
        0,
        Math.min(slots.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1))
      )
      const moving = slots[selected]?.workspace
      if (event.altKey && moving && next !== selected) {
        // One write: main swaps whatever held the target into this slot.
        void setLocalWorkspaceMarkSlot(moving.id, next + 1)
      }
      setSelected(next)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      activateSlot(selected)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const workspace = slots[selected]?.workspace
      if (workspace) {
        event.preventDefault()
        void setLocalWorkspaceMarkSlot(workspace.id, null)
      }
      return
    }
    if (event.key.toLowerCase() === 'a' && !event.metaKey && !event.ctrlKey) {
      if (assignOpenWorkspace(selected)) {
        event.preventDefault()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={() => setSelected(0)}
      >
        <DialogHeader>
          <DialogTitle>Workspace marks</DialogTitle>
          <DialogDescription>
            {jumpLabel ? `${jumpLabel.replace(/1$/, '1–9')} opens a slot. ` : ''}Slots keep their
            numbers when others are cleared.
          </DialogDescription>
        </DialogHeader>
        {/* Why tabIndex: arrow keys and digits need focus here; options are announced via the active descendant. */}
        <ul
          role="listbox"
          aria-label="Mark slots"
          tabIndex={0}
          aria-activedescendant={`${listId}-${selected + 1}`}
          className="space-y-px outline-none"
        >
          {slots.map(({ slot, workspace }) => {
            const index = slot - 1
            const project = catalog.projects.find((entry) => entry.id === workspace?.projectId)
            return (
              <li
                key={slot}
                id={`${listId}-${slot}`}
                role="option"
                aria-selected={index === selected}
                data-selected={index === selected}
                className="jump-palette-item flex h-8 cursor-default items-center gap-2 rounded-md border border-transparent px-2 text-sm"
                onMouseEnter={() => setSelected(index)}
                onClick={() => activateSlot(index)}
              >
                <ShortcutKeyCombo keys={[String(slot)]} className="inline-flex shrink-0" />
                <span
                  className={cn('min-w-0 flex-1 truncate', !workspace && 'text-muted-foreground')}
                >
                  {workspace?.name ?? 'Empty'}
                </span>
                {project ? (
                  <span className="truncate text-xs text-muted-foreground">{project.name}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          1–9 or Enter opens · Enter on an empty slot or A puts the open Workspace there ·{' '}
          {isMac ? '⌥' : 'Alt+'}↑↓ moves · {isMac ? '⌫' : 'Backspace'} clears
        </p>
      </DialogContent>
    </Dialog>
  )
}
