import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commitRuntimeGit } from '@/runtime/runtime-git-sync-client'
import { getRuntimeGitStatus } from '@/runtime/runtime-git-status-client'
import {
  stageRuntimeGitPath,
  unstageRuntimeGitPath
} from '@/runtime/runtime-git-working-tree-client'
import type { GitStatusResult } from '../../../../shared/git-status-types'
import type { LocalProjectRoot } from '../../../../shared/local-projects/types'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'

export function useLocalRootGit(workspaceId: string, root: LocalProjectRoot) {
  const context = useMemo<RuntimeGitContext>(
    () => ({
      target: { kind: 'local' },
      worktreeId: `folder:${workspaceId}`,
      worktreePath: root.path,
      localRoot: { workspaceId, rootId: root.id }
    }),
    [workspaceId, root.id, root.path]
  )
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const readable = useRef(false)
  const generation = useRef(0)
  const live = useRef(true)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const result = await getRuntimeGitStatus(context)
      if (live.current && generation.current === request) {
        readable.current = true
        setStatus(result)
        setError(null)
      }
    } catch (cause) {
      if (live.current && generation.current === request) {
        readable.current = false
        setStatus(null)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
  }, [context])
  useEffect(() => {
    live.current = true
    void refresh()
    const timer = setInterval(() => {
      if (readable.current && !inFlight.current) {
        void refresh()
      }
    }, 5000)
    return () => {
      live.current = false
      clearInterval(timer)
    }
  }, [refresh])
  const mutate = async (operation: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) {
      return false
    }
    inFlight.current = true
    setBusy(true)
    try {
      await operation()
      await refresh()
      return true
    } catch (cause) {
      if (live.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      return false
    } finally {
      inFlight.current = false
      if (live.current) {
        setBusy(false)
      }
    }
  }
  return {
    context,
    status,
    error,
    busy,
    refresh,
    stage: (path: string) => mutate(() => stageRuntimeGitPath(context, path)),
    unstage: (path: string) => mutate(() => unstageRuntimeGitPath(context, path)),
    commit: (message: string) =>
      mutate(async () => {
        const result = await commitRuntimeGit(context, message)
        if (!result.success) {
          throw new Error(result.error || 'Commit failed.')
        }
      })
  }
}
