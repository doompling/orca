// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalProject, LocalWorkspace } from '../../../../shared/local-projects/types'
import {
  localProjectRootScope,
  localWorkspaceCheckoutScope
} from '../../../../shared/local-projects/scope-update'
import { LocalProjectDialog } from './LocalProjectDialog'
import { LocalWorkspaceCheckoutDialog } from './LocalWorkspaceCheckoutDialog'

const actions = vi.hoisted(() => ({
  openModal: vi.fn(),
  modalData: {},
  closeModal: vi.fn(),
  createLocalProject: vi.fn(),
  updateLocalProjectRoots: vi.fn(),
  updateLocalWorkspaceCheckouts: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof actions) => unknown) => selector(actions)
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
  name: 'Task',
  projectId: project.id,
  checkoutOverridesByRootId: { a: '/alternate' },
  defaultRootId: 'b',
  isArchived: false,
  createdAt: 1,
  updatedAt: 1
}
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

async function chooseDefault(label: string) {
  fireEvent.pointerDown(screen.getByRole('combobox'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse'
  })
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

describe('scope editing forms', () => {
  it('preserves root IDs and frozen expected scope when labels/order change', async () => {
    const close = vi.fn()
    const view = render(<LocalProjectDialog project={project} onClose={close} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move A down' }))
    fireEvent.change(screen.getByLabelText('Directory label 2'), { target: { value: 'API' } })
    view.rerender(
      <LocalProjectDialog project={{ ...project, defaultRootId: 'b' }} onClose={close} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save roots' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(actions.updateLocalProjectRoots).toHaveBeenCalledWith({
      projectId: project.id,
      expected: localProjectRootScope(project),
      roots: [project.roots[1], { ...project.roots[0], label: 'API' }],
      defaultRootId: 'a'
    })
    expect(actions.createLocalProject).not.toHaveBeenCalled()
  })

  it('requires an explicit replacement default after removing its root', async () => {
    render(<LocalProjectDialog project={project} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove A' }))
    expect(screen.getByRole('button', { name: 'Save roots' })).toHaveProperty('disabled', true)
    await chooseDefault('B')
    fireEvent.click(screen.getByRole('button', { name: 'Save roots' }))
    await waitFor(() =>
      expect(actions.updateLocalProjectRoots).toHaveBeenCalledWith(
        expect.objectContaining({ roots: [project.roots[1]], defaultRootId: 'b' })
      )
    )
  })

  it('shows refusal inline and keeps the unsaved form open', async () => {
    const close = vi.fn()
    actions.updateLocalProjectRoots.mockRejectedValueOnce(
      new Error('Save unsaved edits in Task first.')
    )
    render(<LocalProjectDialog project={project} onClose={close} />)
    fireEvent.change(screen.getByLabelText('A path'), { target: { value: '/next' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save roots' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Save unsaved edits in Task first.'
    )
    expect(screen.getByLabelText('A path')).toHaveProperty('value', '/next')
    expect(close).not.toHaveBeenCalled()
  })

  it('edits checkout choices without renaming or creating a sibling Workspace', async () => {
    const close = vi.fn()
    render(<LocalWorkspaceCheckoutDialog project={project} workspace={workspace} onClose={close} />)
    fireEvent.change(screen.getByLabelText('A existing worktree path'), { target: { value: '' } })
    await chooseDefault('Use Project default')
    fireEvent.click(screen.getByRole('button', { name: 'Save checkouts' }))
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(actions.updateLocalWorkspaceCheckouts).toHaveBeenCalledWith({
      workspaceId: workspace.id,
      expected: localWorkspaceCheckoutScope(project, workspace),
      checkoutOverridesByRootId: {},
      defaultRootId: null
    })
  })
})
