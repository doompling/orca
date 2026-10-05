// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  LinearCustomViewSummary,
  LinearProjectSummary
} from '../../../shared/linear/project-types'
import type { LinearCollectionResult } from '../../../shared/linear/workspace-types'
import {
  CollectionHarness,
  collectionContext,
  collectionIssueView,
  collectionProject,
  createCollectionReads
} from './task-page-linear-collection-effects.test-support'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('Linear Tasks collection loading', () => {
  it('loads nonempty Projects and both View models when switching away from Issues', async () => {
    const reads = createCollectionReads()
    const view = render(<CollectionHarness mode="issues" reads={reads} />)
    expect(reads.listLinearProjectsFromStore).not.toHaveBeenCalled()
    expect(reads.listLinearCustomViews).not.toHaveBeenCalled()

    view.rerender(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Release plan')).toBeTruthy()
    expect(reads.listLinearProjectsFromStore).toHaveBeenCalledWith(undefined, 36, undefined, {
      force: false,
      sourceContext: collectionContext
    })

    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('Current triage')).toBeTruthy()
    expect(await screen.findByText('Current roadmap')).toBeTruthy()
    expect(reads.listLinearCustomViews).toHaveBeenCalledTimes(2)
    for (const model of ['issue', 'project']) {
      expect(reads.listLinearCustomViews).toHaveBeenCalledWith(model, 36, undefined, {
        force: false,
        sourceContext: collectionContext
      })
    }

    view.rerender(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Release plan')).toBeTruthy()
    await waitFor(() => expect(reads.listLinearProjectsFromStore).toHaveBeenCalledTimes(2))
  })

  it('waits for restored connection state before loading either collection', async () => {
    const reads = createCollectionReads()
    const view = render(<CollectionHarness mode="projects" reads={reads} ready={false} />)
    expect(reads.listLinearProjectsFromStore).not.toHaveBeenCalled()
    view.rerender(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Release plan')).toBeTruthy()
    view.rerender(<CollectionHarness mode="views" reads={reads} ready={false} />)
    expect(reads.listLinearCustomViews).not.toHaveBeenCalled()
    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('Current triage')).toBeTruthy()
  })

  it('ignores a delayed Projects response after leaving and returning to the tab', async () => {
    const reads = createCollectionReads()
    const pending = deferred<LinearCollectionResult<LinearProjectSummary>>()
    reads.listLinearProjectsFromStore.mockReturnValueOnce(pending.promise)
    const view = render(<CollectionHarness mode="projects" reads={reads} />)
    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('Current triage')).toBeTruthy()
    view.rerender(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Release plan')).toBeTruthy()
    await act(async () => {
      pending.resolve({ items: [{ ...collectionProject, name: 'Old response' }] })
    })
    expect(screen.queryByText('Old response')).toBeNull()
    expect(screen.getByText('Release plan')).toBeTruthy()
  })

  it('keeps account and execution-host context on reads and ignores replaced account results', async () => {
    const reads = createCollectionReads()
    const pending = deferred<LinearCollectionResult<LinearProjectSummary>>()
    reads.listLinearProjectsFromStore.mockReturnValueOnce(pending.promise)
    const view = render(<CollectionHarness mode="projects" reads={reads} />)
    const remoteContext = {
      ...collectionContext,
      hostId: 'runtime:team-host' as const,
      providerIdentity: { provider: 'linear' as const, workspaceId: 'account-b' }
    }
    reads.listLinearProjectsFromStore.mockResolvedValue({
      items: [{ ...collectionProject, workspaceId: 'account-b', name: 'Remote plan' }]
    })
    view.rerender(
      <CollectionHarness
        mode="projects"
        reads={reads}
        workspaceId="account-b"
        context={remoteContext}
      />
    )
    expect(await screen.findByText('Remote plan')).toBeTruthy()
    expect(reads.listLinearProjectsFromStore).toHaveBeenLastCalledWith(undefined, 36, undefined, {
      force: false,
      sourceContext: remoteContext
    })
    await act(async () => {
      pending.resolve({ items: [collectionProject] })
    })
    expect(screen.queryByText('Release plan')).toBeNull()
  })

  it('ignores a delayed Views response after leaving and returning to the tab', async () => {
    const reads = createCollectionReads()
    const pending = deferred<LinearCollectionResult<LinearCustomViewSummary>>()
    reads.listLinearCustomViews.mockReturnValueOnce(pending.promise)
    const view = render(<CollectionHarness mode="views" reads={reads} />)
    view.rerender(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Release plan')).toBeTruthy()
    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('Current triage')).toBeTruthy()
    expect(screen.getByText('Current roadmap')).toBeTruthy()
    await act(async () => {
      pending.resolve({ items: [{ ...collectionIssueView, name: 'Old triage' }] })
    })
    expect(screen.queryByText('Old triage')).toBeNull()
    expect(screen.getByText('Current triage')).toBeTruthy()
  })

  it('renders collection read failures instead of leaving a blank Projects or Views panel', async () => {
    const reads = createCollectionReads()
    reads.listLinearProjectsFromStore.mockResolvedValue({
      items: [],
      errors: [
        {
          workspaceId: 'account-a',
          workspaceName: 'Team A',
          type: 'unknown',
          message: 'Project read failed'
        }
      ]
    })
    const view = render(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Unable to load Linear projects')).toBeTruthy()
    expect(screen.getByText('Team A: Project read failed')).toBeTruthy()
    reads.listLinearCustomViews.mockResolvedValue({
      items: [],
      errors: [
        {
          workspaceId: 'account-a',
          workspaceName: 'Team A',
          type: 'unknown',
          message: 'View read failed'
        }
      ]
    })
    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('Unable to load views')).toBeTruthy()
    expect(screen.getAllByText('Team A: View read failed')).toHaveLength(2)
  })

  it('does not label rejected reads as empty collections', async () => {
    const reads = createCollectionReads()
    reads.listLinearProjectsFromStore.mockRejectedValue(new Error('Project request timed out'))
    const view = render(<CollectionHarness mode="projects" reads={reads} />)
    expect(await screen.findByText('Project request timed out')).toBeTruthy()
    expect(screen.getByText('Unable to load Linear projects')).toBeTruthy()
    expect(screen.queryByText('No projects found')).toBeNull()
    reads.listLinearCustomViews.mockRejectedValue(new Error('View request timed out'))
    view.rerender(<CollectionHarness mode="views" reads={reads} />)
    expect(await screen.findByText('View request timed out')).toBeTruthy()
    expect(screen.getByText('Unable to load views')).toBeTruthy()
    expect(screen.queryByText('No views found')).toBeNull()
  })
})
