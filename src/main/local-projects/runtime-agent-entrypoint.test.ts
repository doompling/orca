import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence/loading-store/store'
import { openLocalProjectsTestStore } from './local-projects-store.test-support'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { TerminalWorkspaceLaunchScope } from '../runtime/runtime-legacy-worker-terminal-recovery-types'
import type { TerminalCreateOptions } from '../runtime/runtime-terminal-contracts'
import { assertFolderWorkspacePtyPathUsable } from '../ipc/pty/host-env/spawn-cwd'
import { localWorkspacePtyPathCheck } from './seams/pty-spawn-seam'
import { assertRuntimeAgentEntrypointSupportsWorkspace } from './runtime-agent-entrypoint'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => 'test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

class TestRuntime extends OrcaRuntimeService {
  inspectLaunch(workspace: TerminalWorkspaceLaunchScope, options: TerminalCreateOptions) {
    return this.resolveAgentTerminalCreateOptions(workspace, options)
  }
}

const stores: Store[] = []
const directories: string[] = []
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-agent-entry-')))
  directories.push(directory)
  const first = join(directory, 'first')
  const second = join(directory, 'second')
  mkdirSync(first)
  mkdirSync(second)
  const store = openLocalProjectsTestStore(directory)
  stores.push(store)
  const { workspace } = await store.createLocalProject({
    name: 'Application',
    roots: [
      { id: 'a', path: first },
      { id: 'b', path: second }
    ],
    defaultRootId: 'b'
  })
  const scope: TerminalWorkspaceLaunchScope = {
    id: `folder:${workspace.id}`,
    path: second,
    connectionId: null,
    repo: null,
    folderWorkspace: store.getFolderWorkspace(workspace.id) ?? null
  }
  return { store, scope, runtime: new TestRuntime(store) }
}

describe('unadapted managed agent entrypoints', () => {
  it('refuses runtime create-agent before creating a terminal', async () => {
    const { runtime, scope } = await fixture()
    const create = vi.spyOn(runtime, 'createTerminal')
    await expect(
      runtime.createAgentSession({
        clientOperationId: `${Date.now()}-0123456789abcdef0123456789abcdef`,
        worktree: `id:${scope.id}`,
        agent: 'codex',
        prompt: 'hello',
        presentation: 'background'
      })
    ).rejects.toThrow('New tab → Codex or Claude')
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses typed runtime fresh/resume launches but leaves ordinary shell commands alone', async () => {
    const { runtime, scope } = await fixture()
    for (const options of [
      { startupAgent: 'codex' as const },
      { launchAgent: 'claude' as const },
      { launchConfig: { agentArgs: '', agentEnv: {} } }
    ]) {
      await expect(runtime.inspectLaunch(scope, options)).rejects.toThrow('all Workspace roots')
    }
    const plain = { command: 'echo hello' }
    await expect(runtime.inspectLaunch(scope, plain)).resolves.toBe(plain)
  })

  it('refuses unscoped desktop managed launches and allows an ordinary terminal', async () => {
    const { store, scope } = await fixture()
    for (const launch of [
      { launchAgent: 'codex' },
      { launchConfig: { agentArgs: '', agentEnv: {} } },
      { resumeProviderSession: { sessionId: 'saved' } }
    ]) {
      expect(() => localWorkspacePtyPathCheck(store, scope.id, launch)).toThrow(
        'all Workspace roots'
      )
    }
    await expect(assertFolderWorkspacePtyPathUsable(store, scope.id)).resolves.toBeUndefined()
  })

  it('does not change legacy folder, Git, or absent-owner handling', () => {
    const resolveLocalWorkspace = vi.fn(() => null)
    const store = { resolveLocalWorkspace }
    expect(() =>
      assertRuntimeAgentEntrypointSupportsWorkspace(store, 'folder:legacy')
    ).not.toThrow()
    expect(() =>
      assertRuntimeAgentEntrypointSupportsWorkspace(store, 'repo::/worktree')
    ).not.toThrow()
    expect(() =>
      assertRuntimeAgentEntrypointSupportsWorkspace(undefined, 'folder:legacy')
    ).not.toThrow()
    expect(resolveLocalWorkspace).toHaveBeenCalledTimes(1)
  })
})
