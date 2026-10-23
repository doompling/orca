import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '../../store/slices/editor'
import { TooltipProvider } from '@/components/ui/tooltip'
import EditorFileTab from './EditorFileTab'

vi.mock('@/features/local-projects/use-local-workspace-editor-root', () => ({
  useLocalWorkspaceEditorRoot: () => ({ id: 'b', label: 'App B', path: '/repo' })
}))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn() })
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openMarkdownPreview: vi.fn(), settings: null })
}))
vi.mock('@/store/selectors', () => ({
  useRepoById: () => ({ connectionId: null }),
  useWorktreeById: () => ({ path: '/repo', repoId: 'repo-1' })
}))

describe('EditorFileTab in a local multi-root Workspace', () => {
  it('qualifies the filename with its owning root without changing the file path', () => {
    const file: OpenFile = {
      id: '/repo/notes.md',
      filePath: '/repo/notes.md',
      relativePath: 'notes.md',
      worktreeId: 'folder:workspace',
      language: 'markdown',
      isDirty: false,
      mode: 'edit'
    }
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <EditorFileTab
          file={file}
          isActive={false}
          isPinned={false}
          hasTabsToRight={false}
          hasTabsToLeft={false}
          tabCount={1}
          gitStatus={null}
          onActivate={vi.fn()}
          onClose={vi.fn()}
          onCloseOthers={vi.fn()}
          onCloseToRight={vi.fn()}
          onCloseToLeft={vi.fn()}
          onCloseAll={vi.fn()}
          onMakePermanent={vi.fn()}
          onTogglePin={vi.fn()}
          dragData={{
            kind: 'tab',
            worktreeId: 'folder:workspace',
            groupId: 'group-1',
            unifiedTabId: 'unified-notes',
            visibleTabId: file.id,
            tabType: 'editor',
            label: 'notes.md'
          }}
        />
      </TooltipProvider>
    )
    expect(markup).toContain('App B / notes.md')
    expect(file.relativePath).toBe('notes.md')
  })
})
