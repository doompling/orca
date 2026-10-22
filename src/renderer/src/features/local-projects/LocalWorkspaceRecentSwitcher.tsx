import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/store'
import { getShortcutPlatform } from '@/hooks/useShortcutLabel'
import { getKeybindingContext } from '@/app-shell/app-command-handlers'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import type { LocalWorkspace } from '../../../../shared/local-projects/types'
import { localWorkspacesByRecentVisit } from './local-sidebar-model'
import {
  activeLocalWorkspaceId,
  localWorkspaceVisitedAt,
  openLocalWorkspace
} from './local-workspace-sidebar-actions'

const MAX_ITEMS = 9

type SwitcherState = { items: LocalWorkspace[]; selectedIndex: number }

/** Held-key chord: Shift reverses, so match the configured binding with Shift stripped. */
function matchesSwitcherChord(event: KeyboardEvent): boolean {
  const state = useAppStore.getState()
  return keybindingMatchesAction(
    'workspace.previousRecent',
    {
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: false
    },
    getShortcutPlatform(),
    state.keybindings,
    {
      context: getKeybindingContext(event.target),
      terminalShortcutPolicy: state.settings?.terminalShortcutPolicy
    }
  )
}

function consume(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

/** Ctrl+` tap returns to the previous Workspace; holding Ctrl and pressing again walks further back. */
export function LocalWorkspaceRecentSwitcher(): React.JSX.Element | null {
  const [switcher, setSwitcher] = useState<SwitcherState | null>(null)
  const switcherRef = useRef<SwitcherState | null>(null)
  const heldModifiers = useRef({ ctrl: false, alt: false, meta: false })
  const projects = useAppStore((s) => s.localProjects.projects)

  const update = useCallback((next: SwitcherState | null) => {
    switcherRef.current = next
    setSwitcher(next)
  }, [])

  const openOrAdvance = useCallback(
    (direction: 1 | -1) => {
      const current = switcherRef.current
      if (current) {
        const count = current.items.length
        update({ ...current, selectedIndex: (current.selectedIndex + direction + count) % count })
        return
      }
      const store = useAppStore.getState()
      const activeId = activeLocalWorkspaceId()
      const ordered = localWorkspacesByRecentVisit(store.localProjects, localWorkspaceVisitedAt)
      // The open Workspace leads so the first press lands on the one before it.
      const items = [
        ...ordered.filter((workspace) => workspace.id === activeId),
        ...ordered.filter((workspace) => workspace.id !== activeId)
      ].slice(0, MAX_ITEMS)
      if (items.length < 2) {
        return
      }
      update({ items, selectedIndex: direction === 1 ? 1 : items.length - 1 })
    },
    [update]
  )

  const commit = useCallback(() => {
    const current = switcherRef.current
    update(null)
    const selected = current?.items[current.selectedIndex]
    if (selected && selected.id !== activeLocalWorkspaceId()) {
      openLocalWorkspace(selected.id)
    }
  }, [update])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // The Settings shortcut recorder must capture this chord instead of running it.
      if (
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest('[data-shortcut-recorder-active]') !== null)
      ) {
        return
      }
      if (!event.repeat && matchesSwitcherChord(event)) {
        consume(event)
        if (!switcherRef.current) {
          heldModifiers.current = { ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey }
        }
        openOrAdvance(event.shiftKey ? -1 : 1)
        return
      }
      if (switcherRef.current && event.key === 'Escape') {
        consume(event)
        update(null)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      // Commit once every modifier that opened it is released, so a rebinding can't strand it open.
      const held = heldModifiers.current
      const stillHeld =
        (held.ctrl && event.ctrlKey) || (held.alt && event.altKey) || (held.meta && event.metaKey)
      if (switcherRef.current && !stillHeld) {
        consume(event)
        commit()
      }
    }
    const cancel = (): void => update(null)
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
      window.removeEventListener('blur', cancel)
    }
  }, [commit, openOrAdvance, update])

  if (!switcher) {
    return null
  }
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div
        className="w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-floating"
        role="listbox"
        aria-label="Switch Workspace"
      >
        <div className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
          Recent Workspaces
        </div>
        <div className="py-1">
          {switcher.items.map((workspace, index) => (
            <div
              key={workspace.id}
              role="option"
              aria-selected={index === switcher.selectedIndex}
              data-selected={index === switcher.selectedIndex}
              className="jump-palette-item mx-1 flex h-8 items-center gap-2 rounded-md border border-transparent px-2 text-sm text-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {projects.find((entry) => entry.id === workspace.projectId)?.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
