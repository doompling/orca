import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import {
  goldenStubAgentCommand,
  readGoldenStubAgentLaunchCapture
} from './helpers/golden-stub-agent-launch-capture'
import { tokenizeStartupCommand } from '../../src/shared/tui-agent-startup-shell'
import { localWorkspaceAgentArguments } from '../../src/shared/local-projects/agent-root-arguments'

const fixture = path.resolve('tests/e2e/fixtures/golden-stub-agent/golden-stub-agent.js')

describe('Golden stub launch capture', () => {
  it.each(['codex', 'claude'] as const)(
    'pins %s to its exact fixture, accepted by the normal scope guard',
    async (agent) => {
      const command = goldenStubAgentCommand(agent)
      const shell = process.platform === 'win32' ? 'cmd' : 'posix'
      const parsed = tokenizeStartupCommand(command, shell)
      const executable = await realpath(
        path.join(path.dirname(fixture), process.platform === 'win32' ? `${agent}.cmd` : agent)
      )
      expect(parsed.ok && parsed.tokens).toEqual([executable])
      expect(
        localWorkspaceAgentArguments({
          agent,
          shell,
          commandOverride: command,
          scope: {
            workspaceId: 'workspace',
            projectId: 'project',
            defaultRootId: 'app',
            cwdRootId: 'app',
            cwd: '/app',
            roots: [{ id: 'app', label: 'App', path: '/app' }]
          }
        })
      ).toContain('--add-dir')
    }
  )

  it('captures only the fake process cwd and exact argv, including a multiline prompt', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'orca-stub-capture-'))
    const args = [
      '--golden-capture-launch',
      '--add-dir',
      'C:\\code with spaces',
      '--',
      'Workspace context\n{"roots":["/a","/b"]}'
    ]
    try {
      const result = await runProcess({
        program: process.execPath,
        args: [fixture, ...args],
        cwd: directory,
        input: 'exit\n',
        timeoutMs: 5000,
        maxOutputBytes: 32 * 1024
      })
      expect(result.code).toBe(0)
      expect(result.timedOut).toBe(false)
      expect(readGoldenStubAgentLaunchCapture(result.stdout)).toEqual({
        cwd: await realpath(directory),
        argv: args
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('leaves existing golden fixture output unchanged when capture is not requested', async () => {
    const result = await runProcess({
      program: process.execPath,
      args: [fixture],
      input: 'exit\n',
      timeoutMs: 5000,
      maxOutputBytes: 32 * 1024
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('GOLDEN_STUB_AGENT_READY')
    expect(result.stdout).not.toContain('GOLDEN_STUB_LAUNCH_BEGIN')
    expect(readGoldenStubAgentLaunchCapture(result.stdout)).toBeNull()
  })

  it('rejects clipped or malformed terminal captures', () => {
    expect(readGoldenStubAgentLaunchCapture('GOLDEN_STUB_LAUNCH_BEGIN {')).toBeNull()
    expect(
      readGoldenStubAgentLaunchCapture(
        'GOLDEN_STUB_LAUNCH_BEGIN {"cwd":7,"argv":[]} GOLDEN_STUB_LAUNCH_END'
      )
    ).toBeNull()
  })
})
