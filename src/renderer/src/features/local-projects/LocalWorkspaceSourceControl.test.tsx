// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ResolvedLocalWorkspace } from '../../../../shared/local-projects/types'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { LocalWorkspaceSourceControl } from './LocalWorkspaceSourceControl'

const { read, stage, unstage, commit, openDiff, openFile } = vi.hoisted(() => ({
  read: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  openDiff: vi.fn(),
  openFile: vi.fn()
}))
vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitStatus: read,
  stageRuntimeGitPath: stage,
  unstageRuntimeGitPath: unstage,
  commitRuntimeGit: commit
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openDiff, openFile }) } }))
const workspace: ResolvedLocalWorkspace = {
  workspaceId: 'workspace',
  projectId: 'project',
  defaultRootId: 'a',
  roots: [
    { id: 'a', label: 'A', path: '/a' },
    { id: 'b', label: 'B', path: '/b' },
    { id: 'plain', label: 'Plain', path: '/plain' }
  ]
}
beforeEach(() => {
  read.mockImplementation(async (context: RuntimeGitContext) => {
    if (context.localRoot?.rootId === 'plain') {
      throw new Error('This root is not a Git checkout')
    }
    return {
      branch: `refs/heads/${context.localRoot?.rootId}`,
      conflictOperation: 'unknown',
      entries: [{ path: 'same.txt', status: 'modified', area: 'staged' }]
    }
  })
  commit.mockResolvedValue({ success: true })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
function mount() {
  return render(
    <TooltipProvider>
      <LocalWorkspaceSourceControl workspace={workspace} />
    </TooltipProvider>
  )
}
async function choose(label: string) {
  fireEvent.pointerDown(screen.getByRole('combobox'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse'
  })
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

describe('Workspace Source Control selection', () => {
  it('keeps commit drafts separate and commits only the selected root', async () => {
    mount()
    await screen.findByRole('textbox', { name: 'Commit message' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft A' } })
    await choose('B')
    await waitFor(() => expect(screen.getByRole('textbox').getAttribute('disabled')).toBeNull())
    expect(screen.getByRole('textbox')).toHaveProperty('value', '')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Commit B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit staged changes' }))
    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          worktreePath: '/b',
          localRoot: { workspaceId: 'workspace', rootId: 'b' }
        }),
        'Commit B'
      )
    )
    await choose('A')
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveProperty('value', 'Draft A'))
  })

  it('opens a diff with its original root and keeps the folder session key', async () => {
    mount()
    await choose('B')
    fireEvent.click(await screen.findByRole('button', { name: 'same.txt' }))
    expect(openDiff).toHaveBeenCalledWith(
      'folder:workspace',
      '/b/same.txt',
      'same.txt',
      'plaintext',
      true,
      {
        runtimeEnvironmentId: null,
        localRoot: { workspaceId: 'workspace', rootId: 'b' }
      }
    )
  })

  it('shows plain-root unavailability without mutation controls', async () => {
    mount()
    await choose('Plain')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not a Git checkout')
    )
    expect(screen.queryByRole('button', { name: 'Commit staged changes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unstage same.txt' })).toBeNull()
  })
})
