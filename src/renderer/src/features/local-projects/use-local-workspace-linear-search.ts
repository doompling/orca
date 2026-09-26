import { useEffect, useState } from 'react'
import { linearSearchIssues, linearStatus } from '@/runtime/runtime-linear-client'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearConnectionStatus } from '../../../../shared/linear/workspace-types'

const LOCAL_LINEAR_SETTINGS = { activeRuntimeEnvironmentId: null }
export const LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT = 20

export function useLocalWorkspaceLinearSearch() {
  const [status, setStatus] = useState<LinearConnectionStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [accountId, setAccountId] = useState('')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{
    accountId: string
    query: string
    issues: LinearIssue[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    let current = true
    setStatusLoading(true)
    setStatusError(null)
    setStatus(null)
    setResult(null)
    void linearStatus(LOCAL_LINEAR_SETTINGS).then(
      (next) => {
        if (!current) {
          return
        }
        setStatus(next)
        const accounts = next.connected && !next.credentialError ? (next.workspaces ?? []) : []
        setAccountId((previous) =>
          accounts.some((account) => account.id === previous)
            ? previous
            : accounts.length === 1
              ? accounts[0].id
              : ''
        )
        setStatusLoading(false)
      },
      (error: unknown) => {
        if (current) {
          setStatusError(error instanceof Error ? error.message : String(error))
          setStatusLoading(false)
        }
      }
    )
    return () => {
      current = false
    }
  }, [refresh])

  const accounts = status?.connected && !status.credentialError ? (status.workspaces ?? []) : []
  const account = accounts.find((entry) => entry.id === accountId)
  const term = query.trim()
  const canSearch = Boolean(account && term.length >= 2)
  useEffect(() => {
    if (!canSearch) {
      return
    }
    let current = true
    const timer = setTimeout(() => {
      void linearSearchIssues(
        LOCAL_LINEAR_SETTINGS,
        term,
        LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT,
        accountId
      ).then(
        (issues) => {
          if (current) {
            setResult({
              accountId,
              query: term,
              issues: issues
                .filter((issue) => issue.workspaceId === accountId)
                .slice(0, LOCAL_WORKSPACE_LINEAR_SEARCH_LIMIT),
              error: null
            })
          }
        },
        (error: unknown) => {
          if (current) {
            setResult({
              accountId,
              query: term,
              issues: [],
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      )
    }, 250)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [accountId, canSearch, term, refresh])

  const currentResult = result?.accountId === accountId && result.query === term ? result : null
  return {
    accounts,
    account,
    accountId,
    setAccountId,
    query,
    setQuery,
    issues: canSearch ? (currentResult?.issues ?? []) : [],
    searchError: currentResult?.error ?? null,
    searching: canSearch && currentResult === null,
    statusError: statusError ?? status?.credentialError ?? null,
    statusLoading,
    refresh: () => setRefresh((value) => value + 1)
  }
}
