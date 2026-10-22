// Ether fork: local Workspace switching. Kept out of the core-N slices so upstream registry edits merge cleanly.
import type { KeybindingDefinition } from './types'
import { platformBindings } from './definitions-support'

export type LocalWorkspaceKeybindingActionId =
  | 'workspace.toggleMark'
  | 'workspace.showMarks'
  | 'workspace.previousRecent'

export const KEYBINDING_DEFINITION_LOCAL_WORKSPACES: readonly KeybindingDefinition[] = [
  {
    id: 'workspace.toggleMark',
    title: 'Mark or unmark Workspace',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'workspace', 'mark', 'bookmark', 'harpoon', 'pin', 'slot'],
    defaultBindings: platformBindings(['Mod+Shift+H'])
  },
  {
    id: 'workspace.showMarks',
    title: 'Show Workspace marks',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'workspace', 'marks', 'bookmarks', 'harpoon', 'list'],
    defaultBindings: platformBindings(['Mod+Semicolon'])
  },
  {
    id: 'workspace.previousRecent',
    title: 'Previous recent Workspace',
    group: 'Global',
    scope: 'global',
    searchKeywords: ['shortcut', 'workspace', 'recent', 'mru', 'switch', 'last used', 'toggle'],
    // Why: mirrors tab.previousRecent (Ctrl+Tab) one key over; held Ctrl cycles, release commits.
    defaultBindings: platformBindings(['Ctrl+Backquote'])
  }
]
