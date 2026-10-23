import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import {
  openCodexAppServerConnection,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import { CodexAppServerHandshakeExitUnprovenError } from './codex-app-server-handshake-exit-proof'
import { openCodexThread } from './codex-structured-thread-open'
import { codexStructuredPermissionPolicy } from './codex-structured-permission-policy'

const binary = process.env.ORCA_CODEX_CONTRACT_BINARY
const expectedVersion = process.env.ORCA_CODEX_CONTRACT_VERSION
const REQUEST_TIMEOUT_MS = 15_000
const TEST_TIMEOUT_MS = 60_000

describe.runIf(process.env.ORCA_CODEX_CONTRACT_REQUIRED === '1' && !binary)(
  'Codex binary Workspace scope contract prerequisites',
  () => {
    it('requires an explicitly selected binary', () => {
      expect.fail('ORCA_CODEX_CONTRACT_REQUIRED=1 but ORCA_CODEX_CONTRACT_BINARY is unset')
    })
  }
)

async function createIsolatedEnvironment(): Promise<{
  directory: string
  env: Record<string, string>
}> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'orca-codex-scope-contract-')))
  const env: Record<string, string> = { ORCA_BACKGROUND_LAUNCH: '1' }
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT']) {
    const value = process.env[key]
    if (value !== undefined) {
      env[key] = value
    }
  }
  for (const [key, name] of [
    ['HOME', 'home'],
    ['CODEX_HOME', 'codex'],
    ['XDG_CONFIG_HOME', 'config'],
    ['XDG_CACHE_HOME', 'cache'],
    ['XDG_DATA_HOME', 'data'],
    ['TMPDIR', 'tmp']
  ]) {
    const path = join(directory, name)
    await mkdir(path, { mode: 0o700 })
    env[key] = await realpath(path)
  }
  env.USERPROFILE = env.HOME
  env.APPDATA = env.XDG_CONFIG_HOME
  env.LOCALAPPDATA = env.XDG_DATA_HOME
  env.TEMP = env.TMPDIR
  env.TMP = env.TMPDIR
  return { directory, env }
}

describe.runIf(Boolean(binary))(
  'Codex binary local Workspace scope contract',
  { timeout: TEST_TIMEOUT_MS },
  () => {
    let verifiedBinary = ''

    beforeAll(async () => {
      if (!binary || !isAbsolute(binary) || !expectedVersion) {
        throw new Error(
          'Set an absolute ORCA_CODEX_CONTRACT_BINARY and ORCA_CODEX_CONTRACT_VERSION'
        )
      }
      const fixture = await createIsolatedEnvironment()
      try {
        const result = await runProcess({
          program: binary,
          args: ['--version'],
          cwd: fixture.directory,
          env: fixture.env,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxOutputBytes: 4096
        })
        expect(result.timedOut).toBe(false)
        expect(result.code).toBe(0)
        expect(result.stdout.trim()).toBe(`codex-cli ${expectedVersion}`)
        verifiedBinary = binary
      } finally {
        await rm(fixture.directory, { recursive: true, force: true })
      }
    }, TEST_TIMEOUT_MS)

    it.each([1, 2])('opens a %i-root Workspace without a model turn', async (rootCount) => {
      const fixture = await createIsolatedEnvironment()
      let connection: CodexAppServerConnection | undefined
      let exitProven = true
      try {
        const roots = await Promise.all(
          Array.from({ length: rootCount }, async (_, index) => {
            const path = join(fixture.directory, `root-${index}`)
            await mkdir(path, { mode: 0o700 })
            return { id: `root-${index}`, label: `Root ${index}`, path: await realpath(path) }
          })
        )
        const scope = captureLocalWorkspaceLaunchScope({
          workspaceId: `workspace-${rootCount}`,
          projectId: 'contract-project',
          roots,
          defaultRootId: `root-${rootCount - 1}`
        })
        connection = await openCodexAppServerConnection({
          command: verifiedBinary,
          args: [
            '-c',
            'model_provider="scope_contract"',
            '-c',
            'model_providers.scope_contract={name="Scope contract",base_url="http://127.0.0.1:9/v1",wire_api="responses",requires_openai_auth=false}',
            'app-server'
          ],
          cwd: scope.cwd,
          env: fixture.env,
          envToDelete: Object.keys(process.env).filter((key) => !Object.hasOwn(fixture.env, key))
        })
        const activeConnection = connection
        const methods: string[] = []
        const opened = await openCodexThread(
          {
            request: async (method, params, options) => {
              // The contract must never acquire credentials or start paid work.
              expect(['config/read', 'thread/start']).toContain(method)
              methods.push(method)
              const reply = await activeConnection.request(method, params, options)
              if (method === 'thread/start') {
                expect(reply).toMatchObject({
                  cwd: scope.cwd,
                  approvalPolicy: 'on-request',
                  sandbox: { type: 'workspaceWrite' }
                })
              }
              return reply
            }
          },
          {
            cwd: scope.cwd,
            resumeThreadId: null,
            permissionPolicy: codexStructuredPermissionPolicy('ask'),
            localWorkspaceScope: scope
          },
          REQUEST_TIMEOUT_MS
        )
        expect(opened.threadId).not.toBe('')
        expect(methods).toEqual(['config/read', 'thread/start'])
      } catch (error) {
        if (error instanceof CodexAppServerHandshakeExitUnprovenError) {
          exitProven = false
        }
        throw error
      } finally {
        if (connection) {
          exitProven = await connection.close()
          expect(exitProven, 'The fixture app-server must exit before its home is removed').toBe(
            true
          )
        }
        if (exitProven) {
          await rm(fixture.directory, { recursive: true, force: true })
        }
      }
    })
  }
)
