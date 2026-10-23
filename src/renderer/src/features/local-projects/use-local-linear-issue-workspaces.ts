import { useAppStore } from '@/store'
import { getEnvironmentRuntimeContextKey } from '@/lib/provider-runtime-context'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import {
  localLinearIssueAccount,
  localLinearIssueAttachments,
  localLinearWorkspaceTargets
} from './local-workspace-linear-attachments'

export function useLocalLinearIssueWorkspaces(
  issue: LinearIssue,
  sourceContext?: TaskSourceContext | null
) {
  const catalog = useAppStore((state) => state.localProjects)
  const status = useAppStore((state) => state.linearStatus)
  const statusKey = useAppStore((state) => state.linearStatusContextKey)
  const checked = useAppStore((state) => state.linearStatusChecked)
  // Ether runs no remote hosts, so an issue without a source row came from this host's Linear.
  const hostId = sourceContext?.hostId ?? LOCAL_EXECUTION_HOST_ID
  const accounts =
    checked && statusKey === getEnvironmentRuntimeContextKey(null) ? (status.workspaces ?? []) : []
  const account = localLinearIssueAccount(issue, hostId, accounts)
  const targets = localLinearWorkspaceTargets(catalog)
  const attached = account
    ? localLinearIssueAttachments(targets, account.organizationId, issue.id)
    : []
  return { account, targets, attached }
}
