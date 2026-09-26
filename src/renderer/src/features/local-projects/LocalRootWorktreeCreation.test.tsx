// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateLocalRootWorktreeResult } from '../../../../shared/local-projects/worktree-creation'
import type { LocalProject, LocalWorkspace } from '../../../../shared/local-projects/types'
import { LocalWorkspaceCheckoutChoices } from './LocalWorkspaceCheckoutChoices'
import { LocalWorkspaceCheckoutDialog } from './LocalWorkspaceCheckoutDialog'
import { LocalWorkspaceDialog } from './LocalWorkspaceDialog'

const actions = vi.hoisted(() => ({
  updateLocalWorkspaceCheckouts: vi.fn(async () => {}),
  createLocalWorkspace: vi.fn(async () => {}),
  closeModal: vi.fn(),
  openModal: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (current: ReturnType<typeof state>) => unknown) => selector(state())
}))
const project: LocalProject = {
  id: 'project',
  name: 'Application',
  roots: [
    { id: 'a', label: 'A', path: '/a' },
    { id: 'b', label: 'B', path: '/b' }
  ],
  defaultRootId: 'a',
  isArchived: false,
  createdAt: 1,
  updatedAt: 1
}
const workspace: LocalWorkspace = {
  id: 'workspace',
  projectId: 'project',
  name: 'Task',
  checkoutOverridesByRootId: { b: '/existing-b' },
  isArchived: false,
  createdAt: 1,
  updatedAt: 1
}
function state() {
  return {
    ...actions,
    activeWorktreeId: null,
    modalData: { localProjectId: 'project' },
    localProjects: { version: 1 as const, projects: [project], workspaces: [workspace] }
  }
}
const result: CreateLocalRootWorktreeResult = {
  projectId: 'project',
  rootId: 'a',
  sourcePath: '/a',
  path: '/created-a',
  branchName: 'feature-a',
  baseCommit: 'a'.repeat(40)
}
const createRootWorktree = vi.fn(async (): Promise<CreateLocalRootWorktreeResult> => result)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('api', { localProjects: { createRootWorktree } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Choices() {
  const [overrides, setOverrides] = useState({ b: '/existing-b' })
  const [busy, setBusy] = useState(false)
  return (
    <LocalWorkspaceCheckoutChoices
      projectId="project"
      roots={project.roots}
      overrides={overrides}
      onChange={(next) => setOverrides({ b: '/existing-b', ...next })}
      disabled={busy}
      onBusyChange={setBusy}
      initiallyExpanded
    />
  )
}
function fillCreation() {
  fireEvent.click(screen.getByRole('button', { name: 'Create new worktree for A' }))
  fireEvent.change(screen.getByLabelText('A new branch'), { target: { value: 'feature-a' } })
  fireEvent.change(screen.getByLabelText('A new worktree directory'), {
    target: { value: '/created-a' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }))
}

describe('explicit root worktree creation UI', () => {
  it('names the Project checkout source and fills only the chosen override', async () => {
    render(<Choices />)
    fillCreation()
    await screen.findByRole('status')
    expect(createRootWorktree).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project',
      rootId: 'a',
      expectedRootPath: '/a',
      path: '/created-a',
      branchName: 'feature-a'
    })
    expect(screen.getByLabelText('A existing worktree path')).toHaveProperty('value', '/created-a')
    expect(screen.getByLabelText('B existing worktree path')).toHaveProperty('value', '/existing-b')
    expect(screen.getByText(/current committed HEAD/).textContent).toContain('/a')
    expect(screen.getByRole('status').textContent).toContain(
      'Cancelling or a failed save leaves this worktree intact'
    )
  })

  it('retains the destination and error without binding or retrying after a Git refusal', async () => {
    createRootWorktree.mockRejectedValueOnce(new Error('The worktree destination already exists.'))
    render(<Choices />)
    fillCreation()
    expect((await screen.findByRole('alert')).textContent).toContain('already exists')
    expect(screen.getByLabelText('A new worktree directory')).toHaveProperty('value', '/created-a')
    expect(screen.getByLabelText('A existing worktree path')).toHaveProperty('value', '')
    expect(createRootWorktree).toHaveBeenCalledOnce()
  })

  it('blocks close/save while creation runs, then retains recovery details on a binding refusal', async () => {
    let finish: ((value: CreateLocalRootWorktreeResult) => void) | undefined
    createRootWorktree.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const close = vi.fn()
    actions.updateLocalWorkspaceCheckouts.mockRejectedValueOnce(
      new Error('Close running terminals first.')
    )
    render(<LocalWorkspaceCheckoutDialog project={project} workspace={workspace} onClose={close} />)
    fillCreation()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Save checkouts' })).toHaveProperty('disabled', true)
    if (!finish) {
      throw new Error('Missing creation resolver')
    }
    finish(result)
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Save checkouts' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Close running terminals')
    expect(screen.getByRole('status').textContent).toContain('/created-a')
    expect(screen.getByLabelText('A existing worktree path')).toHaveProperty('value', '/created-a')
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(close).toHaveBeenCalledOnce()
    expect(createRootWorktree).toHaveBeenCalledOnce()
  })

  it('creates a Workspace only after the separate explicit save', async () => {
    render(<LocalWorkspaceDialog />)
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Isolated A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Choose worktrees' }))
    fillCreation()
    await screen.findByRole('status')
    expect(actions.createLocalWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }))
    await waitFor(() => expect(actions.closeModal).toHaveBeenCalledOnce())
    expect(actions.createLocalWorkspace).toHaveBeenCalledWith({
      projectId: 'project',
      name: 'Isolated A',
      checkoutOverridesByRootId: { a: '/created-a' }
    })
  })

  it('defaults to no layout copy and passes only the explicitly selected same-Project source', async () => {
    render(<LocalWorkspaceDialog />)
    const selection = screen.getByLabelText('Copy saved file tabs from')
    expect(selection.textContent).toContain('Do not copy')
    fireEvent.pointerDown(selection, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('option', { name: 'Task' }))
    expect(screen.getByText(/Copies clean saved file tabs/).textContent).toContain(
      'not moved to an alternate checkout'
    )
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Files only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }))
    await waitFor(() => expect(actions.closeModal).toHaveBeenCalledOnce())
    expect(actions.createLocalWorkspace).toHaveBeenCalledWith(
      { projectId: 'project', name: 'Files only', checkoutOverridesByRootId: {} },
      { copyFileLayoutFromWorkspaceId: 'workspace' }
    )
  })
})
