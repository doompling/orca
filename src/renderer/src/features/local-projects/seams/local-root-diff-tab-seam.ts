import type { LocalWorkspaceGitRoot } from '../../../../../shared/local-projects/git-root'

/** Two roots can hold the same relative path, so a local root's diff tab is keyed by its root. */
export function localRootDiffFileId(
  baseId: string,
  localRoot: LocalWorkspaceGitRoot | undefined
): string {
  return localRoot ? `${baseId}:root:${encodeURIComponent(localRoot.rootId)}` : baseId
}

export function localRootOpenFileFields(localRoot: LocalWorkspaceGitRoot | undefined): {
  localRoot?: LocalWorkspaceGitRoot
} {
  return localRoot ? { localRoot: { ...localRoot } } : {}
}
