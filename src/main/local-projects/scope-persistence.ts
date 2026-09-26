import type {
  LocalProject,
  LocalProjectsState,
  LocalWorkspace
} from '../../shared/local-projects/types'
import {
  localProjectRootScope,
  localProjectRootScopeChangesExecution,
  localWorkspaceCheckoutScope,
  sameLocalCheckoutOverrides,
  sameLocalProjectRootScope,
  sameLocalWorkspaceCheckoutScope,
  UpdateLocalProjectRootsSchema,
  UpdateLocalWorkspaceCheckoutsSchema,
  type UpdateLocalProjectRootsArgs,
  type UpdateLocalWorkspaceCheckoutsArgs
} from '../../shared/local-projects/scope-update'
import {
  assertDistinctLocalDirectories,
  resolveExistingCheckoutOverrides,
  resolveExistingLocalDirectory
} from './root-validation'

export type LocalWorkspaceScopeMutationGuard = <T>(
  workspaceIds: readonly string[],
  operation: (assertIdle: () => Promise<void>) => Promise<T>
) => Promise<T>
type ScopePersistence = {
  getLocalProjectsSnapshot(): LocalProjectsState
}
type Commit = (state: LocalProjectsState) => void
const stale = () =>
  new Error('Workspace roots changed while editing. Reopen the dialog and try again.')

function requireProject(state: LocalProjectsState, projectId: string): LocalProject {
  const project = state.projects.find((entry) => entry.id === projectId)
  if (!project) {
    throw new Error('Local Project not found.')
  }
  return project
}

function requireWorkspace(state: LocalProjectsState, workspaceId: string): LocalWorkspace {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId)
  if (!workspace) {
    throw new Error('Local Workspace not found.')
  }
  return workspace
}

function assertProjectRootIds(project: Pick<LocalProject, 'roots' | 'defaultRootId'>): void {
  const ids = new Set(project.roots.map((root) => root.id))
  if (ids.size !== project.roots.length || !ids.has(project.defaultRootId)) {
    throw new Error('Choose distinct root IDs and an explicit default root.')
  }
}

export async function updateLocalProjectRoots(
  owner: ScopePersistence,
  input: UpdateLocalProjectRootsArgs,
  guard: LocalWorkspaceScopeMutationGuard,
  commit: Commit
): Promise<LocalProjectsState> {
  const args = UpdateLocalProjectRootsSchema.parse(input)
  assertProjectRootIds(args)
  const initial = owner.getLocalProjectsSnapshot()
  const project = requireProject(initial, args.projectId)
  if (!sameLocalProjectRootScope(localProjectRootScope(project), args.expected)) {
    throw stale()
  }
  if (sameLocalProjectRootScope(localProjectRootScope(project), args)) {
    return initial
  }
  const executionChanged = localProjectRootScopeChangesExecution(project, args)
  const workspaces = initial.workspaces.filter((entry) => entry.projectId === project.id)
  const assertCurrent = () => {
    const state = owner.getLocalProjectsSnapshot()
    const current = requireProject(state, project.id)
    if (!sameLocalProjectRootScope(localProjectRootScope(current), args.expected)) {
      throw stale()
    }
    const currentWorkspaces = state.workspaces.filter((entry) => entry.projectId === project.id)
    if (
      currentWorkspaces.length !== workspaces.length ||
      workspaces.some((workspace) => {
        const other = currentWorkspaces.find((entry) => entry.id === workspace.id)
        return (
          !other ||
          !sameLocalWorkspaceCheckoutScope(
            localWorkspaceCheckoutScope(project, workspace),
            localWorkspaceCheckoutScope(current, other)
          )
        )
      })
    ) {
      throw stale()
    }
    return { state, current }
  }
  const apply = async (assertIdle: () => Promise<void> = async () => {}) => {
    assertCurrent()
    const roots = executionChanged
      ? await Promise.all(
          args.roots.map(async (root) => ({
            ...root,
            path: await resolveExistingLocalDirectory(root.path)
          }))
        )
      : args.roots
    assertDistinctLocalDirectories(roots.map((root) => root.path))
    const rootIds = new Set(roots.map((root) => root.id))
    const validatedBindings = new Map<string, Record<string, string>>()
    if (executionChanged) {
      for (const workspace of workspaces) {
        const retained = Object.fromEntries(
          Object.entries(workspace.checkoutOverridesByRootId).filter(([id]) => rootIds.has(id))
        )
        const changedBase = roots.some(
          (root) =>
            Object.hasOwn(retained, root.id) &&
            root.path !== project.roots.find((entry) => entry.id === root.id)?.path
        )
        validatedBindings.set(
          workspace.id,
          changedBase
            ? await resolveExistingCheckoutOverrides(
                { ...project, roots, defaultRootId: args.defaultRootId },
                retained
              )
            : retained
        )
      }
    }
    if (executionChanged) {
      await assertIdle()
    }
    const { state, current } = assertCurrent()
    const now = Date.now()
    const next: LocalProjectsState = {
      ...state,
      projects: state.projects.map((entry) =>
        entry.id === project.id
          ? {
              ...current,
              roots,
              defaultRootId: args.defaultRootId,
              updatedAt: Math.max(current.updatedAt, now)
            }
          : entry
      ),
      workspaces: state.workspaces.map((workspace) => {
        const bindings = validatedBindings.get(workspace.id)
        if (!bindings) {
          return workspace
        }
        const defaultRemoved =
          workspace.defaultRootId !== undefined && !rootIds.has(workspace.defaultRootId)
        if (
          !defaultRemoved &&
          sameLocalCheckoutOverrides(bindings, workspace.checkoutOverridesByRootId)
        ) {
          return workspace
        }
        const { defaultRootId, ...rest } = workspace
        return {
          ...rest,
          ...(!defaultRemoved && defaultRootId ? { defaultRootId } : {}),
          checkoutOverridesByRootId: bindings,
          updatedAt: Math.max(workspace.updatedAt, now)
        }
      })
    }
    commit(next)
    return owner.getLocalProjectsSnapshot()
  }
  return executionChanged
    ? guard(
        workspaces.map((workspace) => workspace.id),
        apply
      )
    : apply()
}

export async function updateLocalWorkspaceCheckouts(
  owner: ScopePersistence,
  input: UpdateLocalWorkspaceCheckoutsArgs,
  guard: LocalWorkspaceScopeMutationGuard,
  commit: Commit
): Promise<LocalProjectsState> {
  const args = UpdateLocalWorkspaceCheckoutsSchema.parse(input)
  const assertCurrent = () => {
    const state = owner.getLocalProjectsSnapshot()
    const workspace = requireWorkspace(state, args.workspaceId)
    const project = requireProject(state, workspace.projectId)
    if (
      !sameLocalWorkspaceCheckoutScope(
        localWorkspaceCheckoutScope(project, workspace),
        args.expected
      )
    ) {
      throw stale()
    }
    return { state, project, workspace }
  }
  const initial = assertCurrent()
  if (args.defaultRootId && !initial.project.roots.some((root) => root.id === args.defaultRootId)) {
    throw new Error('Choose a default root belonging to this Project.')
  }
  if (
    sameLocalCheckoutOverrides(
      initial.workspace.checkoutOverridesByRootId,
      args.checkoutOverridesByRootId
    ) &&
    (initial.workspace.defaultRootId ?? null) === args.defaultRootId
  ) {
    return initial.state
  }
  return guard([args.workspaceId], async (assertIdle) => {
    const { project } = assertCurrent()
    const overrides = await resolveExistingCheckoutOverrides(
      project,
      args.checkoutOverridesByRootId
    )
    await assertIdle()
    const { state, workspace } = assertCurrent()
    const { defaultRootId: _defaultRootId, ...rest } = workspace
    const updated: LocalWorkspace = {
      ...rest,
      checkoutOverridesByRootId: overrides,
      ...(args.defaultRootId ? { defaultRootId: args.defaultRootId } : {}),
      updatedAt: Math.max(workspace.updatedAt, Date.now())
    }
    commit({
      ...state,
      workspaces: state.workspaces.map((entry) => (entry.id === workspace.id ? updated : entry))
    })
    return owner.getLocalProjectsSnapshot()
  })
}
