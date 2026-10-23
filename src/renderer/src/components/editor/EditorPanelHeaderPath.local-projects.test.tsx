// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { EditorPanelHeaderPath } from './EditorPanelHeaderPath'

vi.mock('@/features/local-projects/local-workspace-editor-root', () => ({
  getLocalWorkspaceEditorRoot: () => ({ id: 'b', label: 'App B', path: '/repo' })
}))
vi.mock('@/store/selectors', () => ({
  useWorktreeById: () => ({ path: '/repo', repoId: 'repo-1' })
}))
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => 'local'
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))

afterEach(cleanup)

const file: OpenFile = {
  id: '/repo/notes.md',
  filePath: '/repo/notes.md',
  relativePath: 'notes.md',
  worktreeId: 'folder:workspace',
  language: 'markdown',
  isDirty: false,
  mode: 'edit'
}

describe('EditorPanelHeaderPath in a local multi-root Workspace', () => {
  it('qualifies the visible path while preserving the physical copy and rename targets', () => {
    Object.assign(window, { api: { ui: { writeClipboardText: vi.fn() } } })
    render(
      <EditorPanelHeaderPath
        activeFile={file}
        copiedPathVisible={false}
        canShowMarkdownPreview={false}
        onCopyPath={vi.fn()}
        onOpenMarkdownPreview={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'App B / notes.md' }).title).toBe('/repo/notes.md')
    const pathRow = document.querySelector('.editor-header-path-row')
    if (!pathRow) {
      throw new Error('Missing path row')
    }
    fireEvent.contextMenu(pathRow)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Relative Path' }))
    expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith('notes.md')
  })
})
