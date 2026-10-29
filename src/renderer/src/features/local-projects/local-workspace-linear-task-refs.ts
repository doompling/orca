import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspace } from '../../../../shared/linear/workspace-types'
import type { LocalProjectsState } from '../../../../shared/local-projects/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import type { LinkedLinearIssueRef } from '@/components/task-page/linear/task-page-linear-in-orca-issues'
import { getEnvironmentRuntimeContextKey } from '@/lib/provider-runtime-context'
import { localLinearWorkspaceTargets } from './local-workspace-linear-attachments'

/** A local link reads by its saved UUID (as `identifier`) through its exact saved account. */
type LocalLinkedLinearIssueRef = LinkedLinearIssueRef & { issueId: string; workspaceId: string }

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
}): LocalLinkedLinearIssueRef[] {
  if (sourceContext?.hostId !== 'local' || sourceContext.provider !== 'linear') {
    return []
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const refs = new Map<string, LocalLinkedLinearIssueRef>()
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
          identifier: link.issueId,
          issueId: link.issueId,
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
}): LocalLinkedLinearIssueRef[] {
  const localStatus = statusChecked && statusContextKey === getEnvironmentRuntimeContextKey(null)
  return localWorkspaceLinearTaskRefs({
    catalog,
    accounts: localStatus ? accounts : [],
    selectedAccountId,
    sourceContext
  })
}

/** Has Workspace refs plus every local Workspace link to an issue. */
export function useWithLocalWorkspaceLinearTaskRefs(
  worktreeRefs: LinkedLinearIssueRef[],
  {
    selectedLinearWorkspaceId,
    linearTaskSourceContext
  }: {
    selectedLinearWorkspaceId?: string | null
    linearTaskSourceContext: TaskSourceContext | null
  }
): LinkedLinearIssueRef[] {
  const catalog = useAppStore((state) => state.localProjects)
  const accounts = useAppStore((state) => state.linearStatus.workspaces)
  const statusChecked = useAppStore((state) => state.linearStatusChecked)
  const statusContextKey = useAppStore((state) => state.linearStatusContextKey)
  return useMemo(() => {
    const localRefs = localWorkspaceLinearTaskRefsForStatus({
      catalog,
      accounts: accounts ?? [],
      statusChecked,
      statusContextKey,
      selectedAccountId: selectedLinearWorkspaceId,
      sourceContext: linearTaskSourceContext
    })
    return localRefs.length > 0 ? [...worktreeRefs, ...localRefs] : worktreeRefs
  }, [
    accounts,
    catalog,
    linearTaskSourceContext,
    selectedLinearWorkspaceId,
    statusChecked,
    statusContextKey,
    worktreeRefs
  ])
}

/** Drops a local link's read result unless it is the saved issue from the saved account. */
export function dropMismatchedLocalLinearIssues(
  refs: readonly LinkedLinearIssueRef[],
  results: readonly (LinearIssue | null)[]
): (LinearIssue | null)[] {
  return results.map((issue, index) => {
    const ref = refs[index]
    if (!ref || !('issueId' in ref)) {
      return issue
    }
    return issue && issue.id === ref.issueId && issue.workspaceId === ref.workspaceId ? issue : null
  })
}
