import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { LinkedLinearIssueRef } from '@/components/task-page-linear-in-orca-issues'
import { localLinearWorkspaceTargets } from './local-workspace-linear-attachments'

export function localWorkspaceLinearTaskRefs({
  catalog,
  accounts,
  selectedAccountId,
  sourceContext
}: {
  catalog: LocalProjectsState
  accounts: readonly LinearWorkspace[]
  selectedAccountId?: string | null
  sourceContext: TaskSourceContext | null
}): LinkedLinearIssueRef[] {
  if (sourceContext?.hostId !== 'local' || sourceContext.provider !== 'linear') {
    return []
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const refs = new Map<string, LinkedLinearIssueRef>()
  for (const { workspace } of localLinearWorkspaceTargets(catalog)) {
    for (const link of workspace.linearIssues ?? []) {
      const account = accountById.get(link.linearWorkspaceId)
      if (
        !account ||
        account.organizationId !== link.organizationId ||
        (selectedAccountId &&
          selectedAccountId !== 'all' &&
          selectedAccountId !== link.linearWorkspaceId)
      ) {
        continue
      }
      const key = `${link.organizationId}:${link.issueId}`
      if (!refs.has(key)) {
        refs.set(key, {
          identifier: link.identifier,
          issueId: link.issueId,
          organizationId: link.organizationId,
          workspaceId: link.linearWorkspaceId,
          sourceContext: {
            ...sourceContext,
            providerIdentity: {
              provider: 'linear',
              workspaceId: link.linearWorkspaceId,
              workspaceName: account.organizationName
            }
          }
        })
      }
    }
  }
  return [...refs.values()]
}
