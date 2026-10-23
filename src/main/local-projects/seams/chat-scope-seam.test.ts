import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedLocalWorkspace } from '../../../shared/local-projects/types'
import { captureLocalWorkspaceLaunchScope } from '../../../shared/local-projects/agent-launch-scope'
import { WorktreeTerminalMutationLock } from '../../runtime/worktree-terminal-mutation-lock'
import { hostTestAttachParams } from '../../native-chat/agent-session-wire/structured-agent-session-host-test-data'
import { acquireLocalWorkspaceStructuredLaunch } from '../launch-scope-lock'
import { installLocalWorkspaceScopeAcquirer, withLocalWorkspaceScopeLock } from './chat-scope-seam'

vi.mock('../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => ({ deps: { store: { getRecord: () => null } } })
}))

const workspaceKey = 'folder:workspace'
const workspace: ResolvedLocalWorkspace = {
  workspaceId: 'workspace',
  projectId: 'project',
  roots: [
    { id: 'a', label: 'A', path: '/a' },
    { id: 'b', label: 'B', path: '/b' }
  ],
  defaultRootId: 'a'
}

function fixture() {
  const lock = new WorktreeTerminalMutationLock()
  const store = { resolveLocalWorkspace: () => workspace }
  const runtime = { acquireWorktreeTerminalMutation: lock.acquire.bind(lock) }
  const params = hostTestAttachParams(null, {
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: workspaceKey,
      workspaceKind: 'folder'
    },
    localWorkspaceScope: captureLocalWorkspaceLaunchScope(workspace)
  })
  installLocalWorkspaceScopeAcquirer((attach) =>
    acquireLocalWorkspaceStructuredLaunch(store, runtime, attach)
  )
  return { lock, params }
}

afterEach(() => installLocalWorkspaceScopeAcquirer(undefined))

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('chat attach under the local Workspace scope lock', () => {
  it('makes a concurrent sleep wait for the attach, without the attach waiting on the sleep', async () => {
    const f = fixture()
    const attachRunning = deferred()
    const finishAttach = deferred()
    const order: string[] = []
    const attach = withLocalWorkspaceScopeLock(f.params, async () => {
      attachRunning.resolve()
      await finishAttach.promise
      order.push('attach')
    })
    await attachRunning.promise
    const sleep = f.lock.acquire(workspaceKey, 'exclusive').then((release) => {
      order.push('sleep')
      release()
    })
    await Promise.resolve()
    expect(order).toEqual([])
    finishAttach.resolve()
    await Promise.all([attach, sleep])
    expect(order).toEqual(['attach', 'sleep'])
    expect(f.lock.trackedKeyCount).toBe(0)
  })

  it('starts an attach queued behind a sleep once the sleep releases', async () => {
    const f = fixture()
    const releaseSleep = await f.lock.acquire(workspaceKey, 'exclusive')
    const run = vi.fn(async () => 'attached')
    const attach = withLocalWorkspaceScopeLock(f.params, run)
    await Promise.resolve()
    expect(run).not.toHaveBeenCalled()
    releaseSleep()
    await expect(attach).resolves.toBe('attached')
    expect(f.lock.trackedKeyCount).toBe(0)
  })

  it('releases the lock when the attach fails', async () => {
    const f = fixture()
    await expect(
      withLocalWorkspaceScopeLock(f.params, async () => {
        throw new Error('spawn failed')
      })
    ).rejects.toThrow('spawn failed')
    expect(f.lock.trackedKeyCount).toBe(0)
  })
})
