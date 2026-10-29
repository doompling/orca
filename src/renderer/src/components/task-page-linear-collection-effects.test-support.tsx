import { useState } from 'react'
import { vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type {
  LinearCustomViewSummary,
  LinearProjectSummary
} from '../../../shared/linear/project-types'
import type { LinearCollectionResult } from '../../../shared/linear/workspace-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { TaskPageLinearProjectList } from './task-page/linear/ProjectList'
import { TaskPageLinearCustomViewList } from './task-page/linear/CustomViewList'
import type { LinearMode } from './task-page/task-page-localized-options'
import type { TaskPageComposerActionsModel } from './task-page/use-task-page-composer-actions'
import { useTaskPageLinearCollectionEffects } from './task-page/linear/use-task-page-linear-collection-effects'

type Model = TaskPageComposerActionsModel

export const collectionContext: TaskSourceContext = {
  kind: 'task-source',
  provider: 'linear',
  projectId: 'local-project',
  hostId: 'local',
  providerIdentity: { provider: 'linear', workspaceId: 'account-a' }
}

export const collectionProject: LinearProjectSummary = {
  id: 'project-a',
  name: 'Release plan',
  workspaceId: 'account-a',
  workspaceName: 'Team A',
  status: { id: 'status-a', name: 'In progress', type: 'started' },
  progress: 0.5
}

export const collectionIssueView: LinearCustomViewSummary = {
  id: 'view-issues',
  name: 'Current triage',
  workspaceId: 'account-a',
  workspaceName: 'Team A',
  model: 'issue',
  shared: true
}

export const collectionProjectView: LinearCustomViewSummary = {
  id: 'view-projects',
  name: 'Current roadmap',
  workspaceId: 'account-a',
  workspaceName: 'Team A',
  model: 'project',
  shared: true
}

export function createCollectionReads() {
  return {
    setTaskResumeState: vi.fn<Model['setTaskResumeState']>(),
    getCachedLinearProjects: vi.fn<Model['getCachedLinearProjects']>().mockReturnValue(null),
    listLinearProjectsFromStore: vi
      .fn<Model['listLinearProjectsFromStore']>()
      .mockResolvedValue({ items: [collectionProject] }),
    fetchLinearProject: vi.fn<Model['fetchLinearProject']>().mockResolvedValue(null),
    listLinearProjectIssues: vi
      .fn<Model['listLinearProjectIssues']>()
      .mockResolvedValue({ items: [] }),
    setSelectedLinearProject: vi.fn<Model['setSelectedLinearProject']>(),
    setSelectedLinearProjectDetail: vi.fn<Model['setSelectedLinearProjectDetail']>(),
    setLinearProjectDetailLoading: vi.fn<Model['setLinearProjectDetailLoading']>(),
    setLinearProjectDetailError: vi.fn<Model['setLinearProjectDetailError']>(),
    setLinearProjectIssuesResult: vi.fn<Model['setLinearProjectIssuesResult']>(),
    setLinearProjectIssuesLoading: vi.fn<Model['setLinearProjectIssuesLoading']>(),
    setLinearProjectIssuesError: vi.fn<Model['setLinearProjectIssuesError']>(),
    setLinearProjectParentView: vi.fn<Model['setLinearProjectParentView']>(),
    getCachedLinearCustomViews: vi.fn<Model['getCachedLinearCustomViews']>().mockReturnValue(null),
    listLinearCustomViews: vi
      .fn<Model['listLinearCustomViews']>()
      .mockImplementation(async (model) => ({
        items: [model === 'issue' ? collectionIssueView : collectionProjectView]
      })),
    listLinearCustomViewIssues: vi
      .fn<Model['listLinearCustomViewIssues']>()
      .mockResolvedValue({ items: [] }),
    listLinearCustomViewProjects: vi
      .fn<Model['listLinearCustomViewProjects']>()
      .mockResolvedValue({ items: [] }),
    clearSelectedLinearIssue: vi.fn<Model['clearSelectedLinearIssue']>(),
    setLinearCustomViewIssuesResult: vi.fn<Model['setLinearCustomViewIssuesResult']>(),
    setLinearCustomViewProjectsResult: vi.fn<Model['setLinearCustomViewProjectsResult']>(),
    setLinearCustomViewContentsLoading: vi.fn<Model['setLinearCustomViewContentsLoading']>(),
    setLinearCustomViewContentsError: vi.fn<Model['setLinearCustomViewContentsError']>(),
    openLinearProjectContext: vi.fn<Model['openLinearProjectContext']>(),
    openLinearCustomViewContext: vi.fn<Model['openLinearCustomViewContext']>(),
    setLinearProjectTab: vi.fn<Model['setLinearProjectTab']>()
  }
}

export function CollectionHarness({
  mode,
  reads,
  context = collectionContext,
  workspaceId = 'account-a',
  ready = true
}: {
  mode: LinearMode
  reads: ReturnType<typeof createCollectionReads>
  context?: TaskSourceContext
  workspaceId?: string
  ready?: boolean
}) {
  const [appliedLinearProjectSearch, setAppliedLinearProjectSearch] = useState('')
  const [linearProjectsResult, setLinearProjectsResult] = useState<
    LinearCollectionResult<LinearProjectSummary>
  >({ items: [] })
  const [linearProjectsLoading, setLinearProjectsLoading] = useState(false)
  const [linearProjectsError, setLinearProjectsError] = useState<string | null>(null)
  const [linearCustomViewsResult, setLinearCustomViewsResult] = useState<
    LinearCollectionResult<LinearCustomViewSummary>
  >({ items: [] })
  const [linearCustomViewsLoading, setLinearCustomViewsLoading] = useState(false)
  const [linearCustomViewsError, setLinearCustomViewsError] = useState<string | null>(null)
  const model = {
    ...reads,
    linearConnected: ready,
    selectedLinearWorkspaceId: workspaceId,
    taskSource: 'linear',
    linearTaskSourceContext: context,
    taskResumeApplied: ready,
    linearMode: mode,
    linearRefreshNonce: 0,
    linearProjectSearchInput: '',
    appliedLinearProjectSearch,
    setAppliedLinearProjectSearch,
    linearProjectsResult,
    setLinearProjectsResult,
    linearProjectsLoading,
    setLinearProjectsLoading,
    linearProjectsError,
    setLinearProjectsError,
    selectedLinearProject: null,
    linearProjectTab: 'overview',
    linearProjectIssueLimit: 36,
    selectedLinearIssueId: null,
    selectedLinearIssueCanFloat: false,
    linearCustomViewsResult,
    setLinearCustomViewsResult,
    linearCustomViewsLoading,
    setLinearCustomViewsLoading,
    linearCustomViewsError,
    setLinearCustomViewsError,
    selectedLinearCustomView: null,
    linearCustomViewIssueLimit: 36,
    filteredLinearIssues: []
  } satisfies Partial<Model>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fixture supplies every field read by these collection hooks and list surfaces, checked above against the production model.
  const collectionModel = model as unknown as Model
  useTaskPageLinearCollectionEffects(collectionModel)
  return (
    <TooltipProvider>
      {mode === 'projects' ? (
        <TaskPageLinearProjectList model={collectionModel} />
      ) : mode === 'views' ? (
        <TaskPageLinearCustomViewList model={collectionModel} />
      ) : (
        <p>Issues ready</p>
      )}
    </TooltipProvider>
  )
}
