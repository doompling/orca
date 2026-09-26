import { describe, expect, it } from 'vitest'
import { buildAgentStartupPlan } from '../tui-agent-startup'
import { buildAgentResumeStartupPlan } from '../tui-agent-resume-startup'
import { tokenizeStartupCommand } from '../tui-agent-startup-shell'
import { sleepingAgentLaunchConfigSchema } from '../workspace-session-sleeping-agents'
import type { ResolvedLocalWorkspace } from './types'
import { captureLocalWorkspaceLaunchScope, localWorkspaceContextPrompt } from './agent-launch-scope'
import { localWorkspaceAgentArguments } from './agent-root-arguments'

function workspace(): ResolvedLocalWorkspace {
  return {
    workspaceId: 'workspace-a',
    projectId: 'project',
    defaultRootId: 'b',
    roots: [
      { id: 'a', label: 'App A', path: '/code/app a' },
      { id: 'b', label: 'App B', path: '/code/app b' }
    ]
  }
}

describe('frozen Local Workspace agent launch', () => {
  it('captures every root and explicit cwd without sharing mutable Project objects', () => {
    const source = workspace()
    const scope = captureLocalWorkspaceLaunchScope(source, '/code/app a/src')
    source.roots[0].path = '/changed'
    expect(scope.cwd).toBe('/code/app a/src')
    expect(scope.cwdRootId).toBe('a')
    expect(scope.roots.map((root) => root.path)).toEqual(['/code/app a', '/code/app b'])
  })

  it('uses the declared default, not the first root, and refuses cwd outside the roots', () => {
    expect(captureLocalWorkspaceLaunchScope(workspace()).cwd).toBe('/code/app b')
    expect(() => captureLocalWorkspaceLaunchScope(workspace(), '/other')).toThrow(
      'inside a Workspace root'
    )
  })

  it.each(['claude', 'codex'] as const)(
    'grants all roots and preserves existing %s permission arguments',
    (agent) => {
      const scope = captureLocalWorkspaceLaunchScope(workspace())
      const args = localWorkspaceAgentArguments({
        scope,
        agent,
        agentArgs: '--model example',
        shell: 'posix'
      })
      const parsed = tokenizeStartupCommand(args, 'posix')
      expect(parsed.ok && parsed.tokens).toEqual([
        '--model',
        'example',
        '--add-dir',
        '/code/app a',
        '--add-dir',
        '/code/app b',
        ...(agent === 'codex' ? ['--cd', '/code/app b'] : [])
      ])
      expect(args).not.toContain('bypass')
      expect(args).not.toContain('skip-permissions')
    }
  )

  it.each(['posix', 'powershell', 'cmd'] as const)(
    'roundtrips root paths through the existing %s quoting',
    (shell) => {
      const scope = captureLocalWorkspaceLaunchScope(workspace())
      const args = localWorkspaceAgentArguments({ scope, agent: 'codex', shell })
      const parsed = tokenizeStartupCommand(args, shell)
      expect(parsed.ok && parsed.tokens).toContain('/code/app a')
      expect(parsed.ok && parsed.tokens).toContain('/code/app b')
    }
  )

  it.each(['claude', 'codex'] as const)(
    'retains %s scope and flags through serialization and exact resume',
    (agent) => {
      const scope = captureLocalWorkspaceLaunchScope(workspace())
      const initial = buildAgentStartupPlan({
        agent,
        cmdOverrides: {},
        platform: 'darwin',
        localWorkspaceScope: scope,
        agentArgs: localWorkspaceAgentArguments({ scope, agent, shell: 'posix' }),
        prompt: localWorkspaceContextPrompt(scope, 'Read both apps')
      })
      expect(initial).not.toBeNull()
      const saved = sleepingAgentLaunchConfigSchema.parse(
        JSON.parse(JSON.stringify(initial?.launchConfig))
      )
      expect(saved?.localWorkspaceScope).toEqual(scope)
      const resumed = buildAgentResumeStartupPlan({
        ...saved,
        agent,
        cmdOverrides: {},
        platform: 'darwin',
        providerSession: { key: 'session_id', id: 'session-original' }
      })
      expect(resumed?.launchConfig.localWorkspaceScope).toEqual(scope)
      expect(resumed?.launchCommand).toContain("'--add-dir' '/code/app a'")
      expect(resumed?.launchCommand).toContain("'--add-dir' '/code/app b'")
      expect(resumed?.launchCommand).toContain("'session-original'")
      if (agent === 'claude') {
        expect(initial?.launchCommand).toContain("'/code/app b' -- '")
      }
    }
  )

  it('keeps context additive to the user task without changing developer settings', () => {
    const scope = captureLocalWorkspaceLaunchScope(workspace())
    expect(localWorkspaceContextPrompt(scope, 'My task')).toContain('My task')
    expect(localWorkspaceContextPrompt(scope, '')).toContain("Wait for the user's task")
  })

  it.each(['--cd /other', '-C/other', '--worktree', 'resume old-session'])(
    'refuses Codex args that retarget the session: %s',
    (agentArgs) => {
      expect(() =>
        localWorkspaceAgentArguments({
          scope: captureLocalWorkspaceLaunchScope(workspace()),
          agent: 'codex',
          shell: 'posix',
          agentArgs
        })
      ).toThrow('Remove agent arguments')
    }
  )
})
