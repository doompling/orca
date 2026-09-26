import type { Readable, Writable } from 'node:stream'
import type { ChildProcessHandle, ProcessSpec } from '../../shared/child-process/run-process'
import { spawnProcess } from '../../shared/child-process/run-process'
import { RetryableProcessExitProof } from '../../shared/child-process/retryable-process-exit-proof'
import { createProviderSpawnSpec } from '../codex/codex-app-server-posix-supervisor'
import { terminateCodexAppServerProcessTree } from '../codex/codex-app-server-process-teardown'
import { CODEX_SPAWN_TOKEN_ENV } from '../codex/codex-structured-owner-identity'
import { waitForProcessExitUntil } from '../codex/codex-process-exit-deadline'
import type { OpenCodeServerLaunch } from './opencode-server-connection-types'

export type OpenCodeServerChild = Pick<ChildProcessHandle, 'pid' | 'kill'> & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  on: (event: string, listener: () => void) => unknown
}

export type OpenCodeServerProcessDependencies = {
  spawn?: (spec: ProcessSpec) => OpenCodeServerChild
  terminate?: (child: OpenCodeServerChild, spawnToken: string) => Promise<boolean>
  platform?: NodeJS.Platform
  startupTimeoutMs?: number
  exitTimeoutMs?: number
}

export function startOpenCodeServerProcess(
  launch: OpenCodeServerLaunch,
  password: string,
  onExit: () => void,
  onFailure: () => void,
  deps: OpenCodeServerProcessDependencies
) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...launch.env }
  for (const key of launch.envToDelete ?? []) {
    delete env[key]
  }
  Object.assign(env, {
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_SERVER_USERNAME: 'opencode',
    [CODEX_SPAWN_TOKEN_ENV]: launch.spawnToken
  })
  const spec = createProviderSpawnSpec(
    {
      command: launch.command,
      args: ['serve', '--hostname', '127.0.0.1', '--port', '0'],
      cwd: launch.cwd
    },
    env,
    deps.platform ?? process.platform
  )
  const child = (deps.spawn ?? spawnProcess)(spec)
  const ready = Promise.withResolvers<string>()
  const exit = Promise.withResolvers<void>()
  const proof = new RetryableProcessExitProof()
  let exited = false
  let closing = false
  let readySettled = false
  let output = ''
  const timer = setTimeout(() => {
    readySettled = true
    ready.reject(new Error('OpenCode server startup exceeded its deadline.'))
  }, deps.startupTimeoutMs ?? 20_000)

  function fail(): void {
    clearTimeout(timer)
    readySettled = true
    ready.reject(new Error('OpenCode server could not start its private listener.'))
    if (!closing) {
      onFailure()
    }
  }

  function observeExit(): void {
    if (exited) {
      return
    }
    exited = true
    exit.resolve()
    fail()
    if (!closing) {
      onExit()
    }
  }

  child.on('exit', observeExit)
  child.on('close', observeExit)
  child.on('error', fail)
  child.stdin.on('error', fail)
  child.stdout.on('error', fail)
  child.stderr.on('error', fail)
  child.stderr.resume()
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    if (readySettled) {
      return
    }
    if (Buffer.byteLength(output) + Buffer.byteLength(chunk) > 64 * 1024) {
      fail()
      return
    }
    output += chunk
    const boundary = output.lastIndexOf('\n')
    if (boundary === -1) {
      return
    }
    const match = output.slice(0, boundary).match(/\bhttp:\/\/127\.0\.0\.1:(\d+)(?=[/\s]|$)/)
    if (!match) {
      return
    }
    const port = Number(match[1])
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      fail()
      return
    }
    readySettled = true
    output = ''
    clearTimeout(timer)
    ready.resolve(`http://127.0.0.1:${port}`)
  })

  return {
    child,
    ready: ready.promise,
    get exited() {
      return exited
    },
    close: (): Promise<boolean> => {
      if (exited) {
        return Promise.resolve(true)
      }
      closing = true
      clearTimeout(timer)
      ready.reject(new Error('OpenCode server connection closed.'))
      return proof.run(async () => {
        try {
          child.stdin.end()
        } catch {
          // A broken stdin cannot skip the owned-process teardown below.
        }
        await waitForProcessExitUntil(exit.promise, deps.exitTimeoutMs ?? 1_500)
        if (!exited) {
          const terminate = deps.terminate ?? terminateCodexAppServerProcessTree
          if (!(await terminate(child, launch.spawnToken).catch(() => false))) {
            return exited
          }
          await waitForProcessExitUntil(exit.promise, deps.exitTimeoutMs ?? 1_000)
        }
        return exited
      })
    }
  }
}
