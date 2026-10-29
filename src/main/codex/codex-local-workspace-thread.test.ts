import { describe, expect, it, vi } from 'vitest'
import { captureLocalWorkspaceLaunchScope } from '../../shared/local-projects/agent-launch-scope'
import { CodexAppServerRequestError } from './app-server/codex-app-server-request-error'
import { localWorkspaceCodexThreadOverrides } from './codex-local-workspace-thread'
import { openCodexThread } from './codex-structured-thread-open'
import { codexStructuredPermissionPolicy } from '../../shared/codex-permission-policy'

const scope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace-a',
  projectId: 'project',
  defaultRootId: 'b',
  roots: [
    { id: 'a', label: 'App A', path: '/code/app-a' },
    { id: 'b', label: 'App B', path: '/code/app-b' }
  ]
})
const singleRootScope = captureLocalWorkspaceLaunchScope({
  workspaceId: 'workspace-single',
  projectId: 'project-single',
  defaultRootId: 'a',
  roots: [{ id: 'a', label: 'App A', path: '/code/app-a' }]
})
const permissionPolicy = codexStructuredPermissionPolicy('ask')
const configured = {
  config: {
    developer_instructions: 'Keep the user instructions.',
    sandbox_workspace_write: { writable_roots: ['/existing'], network_access: false }
  }
}
const opened = {
  thread: { id: 'thread-original' },
  cwd: scope.cwd,
  sandbox: { type: 'workspaceWrite', writableRoots: ['/existing', '/code/app-a'] }
}

describe('Codex multi-root thread scope', () => {
  it.each([null, 'thread-original'])(
    'passes every frozen root and accepts implicit cwd access on start/resume (%s)',
    async (resumeThreadId) => {
      const request = vi.fn(async (method: string, _params?: Record<string, unknown>) =>
        method === 'config/read' ? configured : opened
      )
      await expect(
        openCodexThread(
          { request },
          { cwd: scope.cwd, resumeThreadId, permissionPolicy, localWorkspaceScope: scope },
          2_000
        )
      ).resolves.toMatchObject({ threadId: 'thread-original' })

      expect(request).toHaveBeenNthCalledWith(
        1,
        'config/read',
        { includeLayers: false, cwd: '/code/app-b' },
        { timeoutMs: 2_000 }
      )
      const threadParams = request.mock.calls[1]?.[1]
      expect(threadParams).toEqual({
        cwd: '/code/app-b',
        ...permissionPolicy,
        config: {
          'sandbox_workspace_write.writable_roots': ['/existing', '/code/app-a', '/code/app-b']
        },
        developerInstructions: expect.stringContaining('Keep the user instructions.'),
        ...(resumeThreadId ? { threadId: resumeThreadId, excludeTurns: true } : {})
      })
      expect(threadParams?.developerInstructions).toContain('App A')
      expect(threadParams?.developerInstructions).toContain('/code/app-a')
      expect(threadParams?.developerInstructions).toContain('App B')
      expect(threadParams?.developerInstructions).toContain('/code/app-b')
      expect(threadParams?.developerInstructions).not.toContain('Wait for the user')
    }
  )

  it.each([{ type: 'workspaceWrite', writableRoots: [] }, { type: 'workspaceWrite' }])(
    'accepts a single-root Workspace with no additional writable roots: %j',
    async (sandbox) => {
      const request = vi.fn(async (method: string) =>
        method === 'config/read' ? { config: {} } : { ...opened, cwd: singleRootScope.cwd, sandbox }
      )
      await expect(
        openCodexThread(
          { request },
          {
            cwd: singleRootScope.cwd,
            resumeThreadId: null,
            permissionPolicy,
            localWorkspaceScope: singleRootScope
          },
          2_000
        )
      ).resolves.toMatchObject({ threadId: 'thread-original' })
    }
  )

  it.each(['readOnly', 'dangerFullAccess'])(
    'does not treat a matching cwd as a Manual write grant under %s',
    async (type) => {
      const request = vi.fn(async (method: string) =>
        method === 'config/read'
          ? { config: {} }
          : { ...opened, cwd: singleRootScope.cwd, sandbox: { type } }
      )
      await expect(
        openCodexThread(
          { request },
          {
            cwd: singleRootScope.cwd,
            resumeThreadId: null,
            permissionPolicy,
            localWorkspaceScope: singleRootScope
          },
          2_000
        )
      ).rejects.toThrow('did not grant access to every Workspace directory')
    }
  )

  it('does not read configuration or alter legacy thread launches', async () => {
    const request = vi.fn(async () => opened)
    await expect(
      localWorkspaceCodexThreadOverrides({ request }, undefined, 2_000)
    ).resolves.toEqual({ config: {} })
    expect(request).not.toHaveBeenCalled()
    await openCodexThread(
      { request },
      { cwd: '/legacy', resumeThreadId: null, permissionPolicy },
      2_000
    )
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'thread/start',
      { cwd: '/legacy', ...permissionPolicy },
      { timeoutMs: 2_000 }
    )
  })

  it('keeps the chat visuals folder writable alongside every Workspace root', async () => {
    const request = vi.fn(async (method: string, _params?: Record<string, unknown>) =>
      method === 'config/read' ? configured : opened
    )
    await openCodexThread(
      { request },
      {
        cwd: scope.cwd,
        resumeThreadId: null,
        permissionPolicy,
        localWorkspaceScope: scope,
        threadConfig: {
          'sandbox_workspace_write.writable_roots': ['/existing', '/chat-visuals'],
          'features.example': true
        }
      },
      2_000
    )
    expect(request.mock.calls[1]?.[1]?.config).toEqual({
      'sandbox_workspace_write.writable_roots': [
        '/existing',
        '/chat-visuals',
        '/code/app-a',
        '/code/app-b'
      ],
      'features.example': true
    })
  })

  it('deduplicates configured roots without replacing unrelated sandbox settings', async () => {
    const request = vi.fn(async () => ({
      config: {
        developer_instructions: null,
        sandbox_workspace_write: {
          writable_roots: ['/code/app-a', '/existing'],
          network_access: false,
          exclude_tmpdir_env_var: true
        }
      }
    }))
    const overrides = await localWorkspaceCodexThreadOverrides({ request }, scope, 2_000)
    expect(overrides.config).toEqual({
      'sandbox_workspace_write.writable_roots': ['/code/app-a', '/existing', '/code/app-b']
    })
    expect(overrides.developerInstructions).not.toContain('null')
  })

  it.each([
    { ...opened, cwd: '/another-workspace' },
    { ...opened, sandbox: { type: 'workspaceWrite', writableRoots: [] } },
    { ...opened, sandbox: { type: 'workspaceWrite' } },
    { ...opened, sandbox: { type: 'workspaceWrite', writableRoots: ['/code/app-b'] } },
    { ...opened, sandbox: { type: 'readOnly' } },
    { thread: opened.thread }
  ])('refuses an unconfirmed effective scope before a task starts: %j', async (reply) => {
    const request = vi.fn(async (method: string) => (method === 'config/read' ? configured : reply))
    await expect(
      openCodexThread(
        { request },
        { cwd: scope.cwd, resumeThreadId: null, permissionPolicy, localWorkspaceScope: scope },
        2_000
      )
    ).rejects.toThrow(/did not (confirm|grant)/)
    expect(request.mock.calls.map(([method]) => method)).toEqual(['config/read', 'thread/start'])
  })

  it('accepts a parent writable root when the provider confirms both directories', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'config/read'
        ? configured
        : { ...opened, sandbox: { type: 'workspaceWrite', writableRoots: ['/code'] } }
    )
    await expect(
      openCodexThread(
        { request },
        { cwd: scope.cwd, resumeThreadId: null, permissionPolicy, localWorkspaceScope: scope },
        2_000
      )
    ).resolves.toMatchObject({ threadId: 'thread-original' })
  })

  it('preserves an explicitly selected bypass policy without introducing one itself', async () => {
    const request = vi.fn(async (method: string, _params?: Record<string, unknown>) =>
      method === 'config/read' ? configured : { ...opened, sandbox: { type: 'dangerFullAccess' } }
    )
    await openCodexThread(
      { request },
      {
        cwd: scope.cwd,
        resumeThreadId: null,
        localWorkspaceScope: scope,
        permissionPolicy: codexStructuredPermissionPolicy('full-access')
      },
      2_000
    )
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      sandbox: 'danger-full-access',
      approvalPolicy: 'never'
    })
  })

  it('keeps the full scope when an unsaved resume restarts as a new thread', async () => {
    const request = vi.fn(async (method: string, _params?: Record<string, unknown>) => {
      if (method === 'config/read') {
        return configured
      }
      if (method === 'thread/resume') {
        throw new CodexAppServerRequestError(
          'thread/resume',
          -32600,
          'no rollout found for thread id thread-unsaved'
        )
      }
      return opened
    })
    await openCodexThread(
      { request },
      {
        cwd: scope.cwd,
        resumeThreadId: 'thread-unsaved',
        supersedeIfUnsaved: true,
        permissionPolicy,
        localWorkspaceScope: scope
      },
      2_000
    )
    const threadCalls = request.mock.calls.filter(([method]) => method !== 'config/read')
    expect(threadCalls.map(([method]) => method)).toEqual(['thread/resume', 'thread/start'])
    for (const [, params] of threadCalls) {
      expect(params).toMatchObject({
        cwd: scope.cwd,
        ...permissionPolicy,
        config: {
          'sandbox_workspace_write.writable_roots': ['/existing', '/code/app-a', '/code/app-b']
        },
        developerInstructions: expect.stringContaining('App B')
      })
    }
  })

  it.each([{}, { config: { developer_instructions: 42 } }])(
    'refuses unreadable configuration without launching a single-root fallback: %j',
    async (reply) => {
      const request = vi.fn(async () => reply)
      await expect(
        openCodexThread(
          { request },
          { cwd: scope.cwd, resumeThreadId: null, localWorkspaceScope: scope },
          2_000
        )
      ).rejects.toThrow('could not report its configuration')
      expect(request).toHaveBeenCalledTimes(1)
    }
  )

  it('still verifies granted access when the user selected bypass but the provider ignored it', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'config/read'
        ? configured
        : { ...opened, sandbox: { type: 'workspaceWrite', writableRoots: ['/code/app-b'] } }
    )
    await expect(
      openCodexThread(
        { request },
        {
          cwd: scope.cwd,
          resumeThreadId: null,
          localWorkspaceScope: scope,
          permissionPolicy: codexStructuredPermissionPolicy('full-access')
        },
        2_000
      )
    ).rejects.toThrow('did not grant access to every Workspace directory')
  })
})
