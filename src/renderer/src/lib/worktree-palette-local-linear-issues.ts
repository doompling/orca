import type { Worktree } from '../../../shared/worktree/types'
import {
  localWorkspaceLinearIssueKey,
  type LocalWorkspaceLinearIssue
} from '../../../shared/local-projects/linear-issues'
import { parseLinearIssueUrlIntent, type LinearIssueUrlIntent } from '../../../shared/linear/links'
import { composePaletteEvidence } from './palette-match/evidence-composer'

// Renderer-only search evidence; the canonical catalog owns these links.
type LocalWorkspacePaletteRow = Worktree & {
  localLinearIssues?: readonly LocalWorkspaceLinearIssue[]
}

function localIssues(row: LocalWorkspacePaletteRow): readonly LocalWorkspaceLinearIssue[] {
  return row.hostId === 'local' && row.id.startsWith('folder:') ? (row.localLinearIssues ?? []) : []
}

export function buildLocalWorkspaceLinearEvidence(row: LocalWorkspacePaletteRow) {
  return localIssues(row).map((issue) =>
    composePaletteEvidence({
      id: `linear:${localWorkspaceLinearIssueKey(issue)}`,
      kind: 'task',
      accessibilityLabel: 'Linked Linear issue',
      parts: [
        {
          key: 'identifier',
          text: issue.identifier,
          profile: 'identifier',
          identifier: { kind: 'key' }
        },
        { key: 'title', text: issue.title, profile: 'prose' }
      ]
    })
  )
}

export function localWorkspaceMatchesLinearUrl(
  row: LocalWorkspacePaletteRow,
  intent: LinearIssueUrlIntent
): boolean {
  return localIssues(row).some((issue) => {
    const saved = parseLinearIssueUrlIntent(issue.url)
    return (
      saved?.identifier === intent.identifier &&
      saved.organizationUrlKey.toLowerCase() === intent.organizationUrlKey.toLowerCase()
    )
  })
}
