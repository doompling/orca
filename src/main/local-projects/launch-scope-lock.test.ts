import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedLocalWorkspace } from '../../shared/local-projects/types'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { WorktreeTerminalMutationLock } from '../runtime/worktree-terminal-mutation-lock'
import { hostTestAttachParams } from '../native-chat/agent-session-wire/structured-agent-session-host-test-data'
import {
  acquireLocalWorkspacePtyLaunch,
  acquireLocalWorkspaceStructuredLaunch
} from './launch-scope-lock'

const state = vi.hoisted(() => ({ existing: false }))
vi.mock('../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => ({
    deps: { store: { getRecord: () => (state.existing ? {} : null) } }
  })
}))
beforeEach(() => {
  state.existing = false
})
function fixture() {
  let workspace: ResolvedLocalWorkspace = {
    workspaceId: 'workspace',
    projectId: 'project',
    roots: [
      { id: 'a', label: 'A', path: '/a' },
      { id: 'b', label: 'B', path: '/b' }
    ],
    defaultRootId: 'a'
  }
  const lock = new WorktreeTerminalMutationLock()
  return {
    store: { resolveLocalWorkspace: () => workspace },
    runtime: {
      acquireWorktreeTerminalMutation: lock.acquire.bind(lock),
      acquireWorktreeTerminalSpawn: (worktreeId?: string) =>
        lock.acquire(worktreeId ?? '', 'shared')
    },
    lock,
    original: workspace,
    change: () => {
      workspace = { ...workspace, roots: [{ id: 'c', label: 'C', path: '/c' }], defaultRootId: 'c' }
    }
  }
}
describe('local Workspace launch versus scope edits', () => {
  it('checks the fresh PTY snapshot after a queued scope edit releases its exclusive lock', async () => {
    const f = fixture()
    const releaseEdit = await f.lock.acquire('folder:workspace', 'exclusive')
    const launch = acquireLocalWorkspacePtyLaunch(f.store, f.runtime, {
      worktreeId: 'folder:workspace',
      cwd: '/a',
      launchConfig: {
        agentArgs: '',
        agentEnv: {},
        localWorkspaceScope: captureLocalWorkspaceLaunchScope(f.original)
      }
    })
    f.change()
    releaseEdit()
    await expect(launch).rejects.toThrow('roots changed before launch')
    expect(f.lock.trackedKeyCount).toBe(0)
  })

  it('rejects a stale plain terminal cwd and allows explicit historical agent resume without rebinding', async () => {
    const f = fixture()
    f.change()
    await expect(
      acquireLocalWorkspacePtyLaunch(f.store, f.runtime, {
        worktreeId: 'folder:workspace',
        cwd: '/a'
      })
    ).rejects.toThrow('no longer inside')
    const scope = captureLocalWorkspaceLaunchScope(f.original)
    const release = await acquireLocalWorkspacePtyLaunch(f.store, f.runtime, {
      worktreeId: 'folder:workspace',
      cwd: '/a',
      resumeProviderSession: { id: 'old' },
      launchConfig: { agentArgs: '', agentEnv: {}, localWorkspaceScope: scope }
    })
    expect(scope.roots[0].path).toBe('/a')
    release?.()
    expect(f.lock.trackedKeyCount).toBe(0)
  })

  it('serializes structured admission on the same lock and rejects only new stale captures', async () => {
    const f = fixture()
    const params = hostTestAttachParams(null, {
      location: {
        executionHostId: 'local',
        wslDistro: null,
        workspaceId: 'folder:workspace',
        workspaceKind: 'folder'
      },
      localWorkspaceScope: captureLocalWorkspaceLaunchScope(f.original)
    })
    f.change()
    await expect(acquireLocalWorkspaceStructuredLaunch(f.store, f.runtime, params)).rejects.toThrow(
      'roots changed before launch'
    )
    state.existing = true
    const release = await acquireLocalWorkspaceStructuredLaunch(f.store, f.runtime, params)
    expect(f.lock.trackedKeyCount).toBe(1)
    release()
    expect(f.lock.trackedKeyCount).toBe(0)
  })
})
