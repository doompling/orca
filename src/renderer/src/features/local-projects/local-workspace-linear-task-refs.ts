import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { LinkedLinearIssueRef } from '@/components/task-page/linear/task-page-linear-in-orca-issues'
import { getEnvironmentRuntimeContextKey } from '@/lib/provider-runtime-context'
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

/** Local links only count accounts vouched for by this host's checked Linear status. */
export function localWorkspaceLinearTaskRefsForStatus({
  catalog,
  accounts,
  statusChecked,
  statusContextKey,
  selectedAccountId,
  sourceContext
}: Parameters<typeof localWorkspaceLinearTaskRefs>[0] & {
  statusChecked: boolean
  statusContextKey: string | null
}): LinkedLinearIssueRef[] {
  const localStatus = statusChecked && statusContextKey === getEnvironmentRuntimeContextKey(null)
  return localWorkspaceLinearTaskRefs({
    catalog,
    accounts: localStatus ? accounts : [],
    selectedAccountId,
    sourceContext
  })
}

type LinkedIssueReader = (
  id: string,
  workspaceId?: string | null,
  options?: { sourceContext?: TaskSourceContext | null }
) => Promise<LinearIssue | null>

/** Reads a linked issue, by its saved UUID when a local link supplied one. */
export async function readLinkedLinearIssueRef(
  ref: LinkedLinearIssueRef,
  options: {
    fetch: LinkedIssueReader
    refresh: LinkedIssueReader
    forceRefresh: boolean
    workspaceId?: string | null
    sourceContext: TaskSourceContext | null
  }
): Promise<LinearIssue | null> {
  const read = options.forceRefresh ? options.refresh : options.fetch
  const result = await read(ref.issueId ?? ref.identifier, ref.workspaceId ?? options.workspaceId, {
    sourceContext: ref.sourceContext ?? options.sourceContext
  })
  if (ref.issueId && (result?.id !== ref.issueId || result.workspaceId !== ref.workspaceId)) {
    return null
  }
  return result
}
