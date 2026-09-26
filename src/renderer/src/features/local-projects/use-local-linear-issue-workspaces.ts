import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { getSettingsFocusedExecutionHostId } from '../../../../shared/execution-host'
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
  const settings = useAppStore((state) => state.settings)
  const hostId = sourceContext?.hostId ?? getSettingsFocusedExecutionHostId(settings)
  const accounts =
    checked && statusKey === getProviderRuntimeContextKey(null) ? (status.workspaces ?? []) : []
  const account = localLinearIssueAccount(issue, hostId, accounts)
  const targets = localLinearWorkspaceTargets(catalog)
  const attached = account
    ? localLinearIssueAttachments(targets, account.organizationId, issue.id)
    : []
  return { account, targets, attached }
}
