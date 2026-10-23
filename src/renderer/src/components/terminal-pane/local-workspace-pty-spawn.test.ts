import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureLocalWorkspaceLaunchScope } from '../../../../shared/local-projects/agent-launch-scope'
import { spawnIpcPty } from './ipc-pty-spawn-request'

const scope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace',
  projectId: 'project',
  defaultRootId: 'b',
  roots: [
    { id: 'a', label: 'A', path: '/saved/a' },
    { id: 'b', label: 'B', path: '/saved/b' }
  ]
})
const launchConfig = { agentArgs: '', agentEnv: {}, localWorkspaceScope: scope }

describe('Local Workspace PTY request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pins a cold-resume snapshot cwd instead of the current tab path', async () => {
    const spawn = vi.fn().mockResolvedValue({ id: 'pty' })
    vi.stubGlobal('window', { api: { pty: { spawn } } })
    await spawnIpcPty(
      { worktreeId: 'folder:workspace', cwd: '/changed' },
      { launchConfig, url: '', callbacks: {} }
    )
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/saved/b', launchConfig }))
  })

  it.each([
    { worktreeId: 'folder:other' },
    { worktreeId: 'folder:workspace', connectionId: 'ssh-host' }
  ])('refuses a different owner before IPC', async (owner) => {
    const spawn = vi.fn()
    vi.stubGlobal('window', { api: { pty: { spawn } } })
    await expect(
      spawnIpcPty({ ...owner, launchConfig }, { url: '', callbacks: {} })
    ).rejects.toThrow('different Workspace')
    expect(spawn).not.toHaveBeenCalled()
  })
})
