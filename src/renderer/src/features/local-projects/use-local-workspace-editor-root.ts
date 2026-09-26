import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { getLocalWorkspaceEditorRoot } from './local-workspace-editor-root'

export function useLocalWorkspaceEditorRoot(file: OpenFile) {
  const catalog = useAppStore((state) => state.localProjects)
  return getLocalWorkspaceEditorRoot(catalog, file)
}
