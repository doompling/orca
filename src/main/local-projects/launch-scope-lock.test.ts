import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberSessionScope, setSessionScopeFileForTests } from './session-scope-store'
import type { ResolvedLocalWorkspace } from '../../shared/local-projects/types'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { WorktreeTerminalMutationLock } from '../runtime/worktree-terminal-mutation-lock'
import { hostTestAttachParams } from '../native-chat/agent-session-wire/structured-agent-session-host-test-data'
import {
  assertLocalWorkspacePtyLaunchUnderLock,
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
// Upstream's PTY spawn path: take the spawn lock, then run our check under it.
async function acquirePtyLaunch(
  f: ReturnType<typeof fixture>,
  args: Parameters<typeof assertLocalWorkspacePtyLaunchUnderLock>[1]
): Promise<() => void> {
  const release = await f.runtime.acquireWorktreeTerminalSpawn(args.worktreeId)
  try {
    assertLocalWorkspacePtyLaunchUnderLock(f.store, args, release !== undefined)
  } catch (error) {
    release?.()
    throw error
  }
  return release
}
describe('local Workspace launch versus scope edits', () => {
  it('checks the fresh PTY snapshot after a queued scope edit releases its exclusive lock', async () => {
    const f = fixture()
    const releaseEdit = await f.lock.acquire('folder:workspace', 'exclusive')
    const launch = acquirePtyLaunch(f, {
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
      acquirePtyLaunch(f, {
        worktreeId: 'folder:workspace',
        cwd: '/a'
      })
    ).rejects.toThrow('no longer inside')
    const scope = captureLocalWorkspaceLaunchScope(f.original)
    const release = await acquirePtyLaunch(f, {
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
      }
    })
    setSessionScopeFileForTests(
      join(mkdtempSync(join(tmpdir(), 'ether-launch-scope-')), 'scopes.json')
    )
    rememberSessionScope(
      { sessionId: params.envelope.sessionId, location: params.location },
      captureLocalWorkspaceLaunchScope(f.original),
      true
    )
    f.change()
    await expect(acquireLocalWorkspaceStructuredLaunch(f.store, f.runtime, params)).rejects.toThrow(
      'roots changed before launch'
    )
    state.existing = true
    const release = await acquireLocalWorkspaceStructuredLaunch(f.store, f.runtime, params)
    expect(f.lock.trackedKeyCount).toBe(1)
    release()
    expect(f.lock.trackedKeyCount).toBe(0)
    setSessionScopeFileForTests(undefined)
  })
})
