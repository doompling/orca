// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { LocalWorkspaceDialog } from './LocalWorkspaceDialog'
import { LocalProjectDialog } from './LocalProjectDialog'
import {
  localLinearCatalog,
  localLinearIssue,
  localLinearSource
} from './local-workspace-linear-test-fixtures'
import { buildLinearIssueLinkedWorkItem } from '@/lib/linear-linked-work-item'
import { usesLocalWorkspaceComposer } from './local-workspace-composer-intent'

vi.mock('@/components/NewWorkspaceComposerModal', () => ({ default: () => <p>Legacy composer</p> }))
vi.mock('./LocalWorkspaceCheckoutChoices', () => ({ LocalWorkspaceCheckoutChoices: () => null }))

function intent() {
  return {
    prefilledName: 'ENG-1-investigate',
    linkedWorkItem: buildLinearIssueLinkedWorkItem(localLinearIssue),
    linearIssue: { linearWorkspaceId: 'account', issueId: 'issue' },
    taskSourceContext: localLinearSource
  }
}
function setup() {
  const createLocalWorkspace = vi.fn(async () => {})
  const closeModal = vi.fn()
  useAppStore.setState({
    localProjects: localLinearCatalog(),
    activeWorktreeId: 'folder:main',
    modalData: intent(),
    createLocalWorkspace,
    closeModal
  })
  render(<LocalWorkspaceDialog />)
  return { createLocalWorkspace, closeModal }
}
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('local Workspace ticket intent', () => {
  it('keeps the suggested name and exact issue identity in the confirmed create request', async () => {
    const { createLocalWorkspace, closeModal } = setup()
    expect(screen.getByLabelText('Workspace name')).toHaveProperty('value', 'ENG-1-investigate')
    expect(screen.getByRole('status').textContent).toContain('ENG-1 · Fixture issue')
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }))
    await waitFor(() => expect(closeModal).toHaveBeenCalledOnce())
    expect(createLocalWorkspace).toHaveBeenCalledExactlyOnceWith({
      projectId: 'project',
      name: 'ENG-1-investigate',
      checkoutOverridesByRootId: {},
      linearIssue: { linearWorkspaceId: 'account', issueId: 'issue' }
    })
  })

  it('retains the name and issue after a pre-commit failure and retries the same selection', async () => {
    const { createLocalWorkspace, closeModal } = setup()
    createLocalWorkspace.mockRejectedValueOnce(new Error('Could not verify issue'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not verify issue')
    expect(closeModal).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Workspace name')).toHaveProperty('value', 'ENG-1-investigate')
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }))
    await waitFor(() => expect(closeModal).toHaveBeenCalledOnce())
    expect(createLocalWorkspace.mock.calls[1]).toEqual(createLocalWorkspace.mock.calls[0])
  })

  it('prevents a second submission while verification is pending', async () => {
    const { createLocalWorkspace } = setup()
    let finish: (() => void) | undefined
    createLocalWorkspace.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const button = screen.getByRole('button', { name: 'Create Workspace' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(createLocalWorkspace).toHaveBeenCalledOnce()
    finish?.()
    await waitFor(() => expect(button).not.toHaveProperty('disabled', true))
  })

  it('leaves explicit remote, unresolved URL, and other-provider intents on the existing composer', () => {
    expect(usesLocalWorkspaceComposer(intent())).toBe(true)
    expect(usesLocalWorkspaceComposer({ ...intent(), taskSourceContext: null }, 'remote')).toBe(
      false
    )
    expect(usesLocalWorkspaceComposer(intent(), 'remote')).toBe(true)
    expect(usesLocalWorkspaceComposer({})).toBe(true)
    for (const data of [
      { ...intent(), taskSourceContext: { ...localLinearSource, hostId: 'ssh:other' } },
      { ...intent(), linkedWorkItem: { provider: 'github' } },
      { prefilledName: localLinearIssue.url },
      { initialRepoId: 'legacy-repo' },
      { linkedWorkItem: buildLinearIssueLinkedWorkItem(localLinearIssue) }
    ]) {
      expect(usesLocalWorkspaceComposer(data)).toBe(false)
    }
  })

  it('retains ticket intent while a fresh profile chooses its first Project', () => {
    const openModal = vi.fn()
    useAppStore.setState({
      localProjects: { version: 1, projects: [], workspaces: [] },
      modalData: intent(),
      openModal
    })
    render(<LocalWorkspaceDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(openModal).toHaveBeenCalledExactlyOnceWith('add-repo', {
      workspaceComposerIntent: intent()
    })
  })

  it('returns to the original Workspace intent after creating the first Project', async () => {
    const openModal = vi.fn()
    const closeModal = vi.fn()
    const createLocalProject = vi.fn(async () => {})
    useAppStore.setState({
      modalData: { workspaceComposerIntent: intent() },
      openModal,
      closeModal,
      createLocalProject
    })
    render(<LocalProjectDialog />)
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'First' } })
    fireEvent.change(screen.getByLabelText('Directory path'), { target: { value: '/source' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add directory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))
    await waitFor(() =>
      expect(openModal).toHaveBeenCalledExactlyOnceWith('new-workspace-composer', intent())
    )
    expect(createLocalProject).toHaveBeenCalledOnce()
    expect(closeModal).not.toHaveBeenCalled()
  })
})
