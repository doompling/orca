import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { getLocalWorkspaceEditorRoot } from './local-workspace-editor-root'
import { getEditorDisplayLabel } from '@/components/editor/editor-labels'

export function useLocalWorkspaceEditorRoot(file: OpenFile) {
  const catalog = useAppStore((state) => state.localProjects)
  return getLocalWorkspaceEditorRoot(catalog, file)
}

/** `Root / relative path` for a file in a multi-root Workspace; `fallback` for any other file. */
export function useLocalWorkspaceEditorPathLabel(file: OpenFile, fallback: string): string {
  const root = useLocalWorkspaceEditorRoot(file)
  return root ? `${root.label} / ${getEditorDisplayLabel(file, 'relativePath')}` : fallback
}
