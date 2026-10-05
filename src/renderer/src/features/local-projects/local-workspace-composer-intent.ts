import { normalizeStoredTaskSourceContext } from '../../../../shared/task-source-context'
import { parseLinearIssueUrlIntent } from '../../../../shared/linear/links'
import { LocalWorkspaceLinearIssueSelectionSchema } from '../../../../shared/local-projects/linear-issues'

export function readLocalWorkspaceComposerIssue(data: Record<string, unknown>) {
  const parsed = LocalWorkspaceLinearIssueSelectionSchema.safeParse(data.linearIssue)
  return parsed.success ? parsed.data : undefined
}

export function usesLocalWorkspaceComposer(
  data: Record<string, unknown>,
  activeRuntimeEnvironmentId?: string | null
): boolean {
  if (data.taskSourceContext != null) {
    const context = normalizeStoredTaskSourceContext(data.taskSourceContext)
    if (!context || context.hostId !== 'local') {
      return false
    }
  }
  if (data.initialEphemeralVmRecipeId || data.initialProjectGroupId || data.initialGitHubWorkItem) {
    return false
  }
  const item = data.linkedWorkItem
  if (item != null) {
    if (data.taskSourceContext == null && activeRuntimeEnvironmentId) {
      return false
    }
    return (
      typeof item === 'object' &&
      'provider' in item &&
      item.provider === 'linear' &&
      readLocalWorkspaceComposerIssue(data) !== undefined
    )
  }
  return !(
    data.initialRepoId ||
    (typeof data.prefilledName === 'string' && parseLinearIssueUrlIntent(data.prefilledName))
  )
}

export function localWorkspaceComposerIssueLabel(data: Record<string, unknown>): string | null {
  if (!readLocalWorkspaceComposerIssue(data)) {
    return null
  }
  const item = data.linkedWorkItem
  if (!item || typeof item !== 'object') {
    return null
  }
  const identifier =
    'linearIdentifier' in item && typeof item.linearIdentifier === 'string'
      ? item.linearIdentifier
      : ''
  const title = 'title' in item && typeof item.title === 'string' ? item.title : ''
  return [identifier, title].filter(Boolean).join(' · ') || null
}
