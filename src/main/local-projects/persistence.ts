import { randomUUID } from 'node:crypto'
import { readLocalWorkspaceLinearIssue } from './linear-issue-linking'
import {
  attachLocalWorkspaceLinearIssue,
  detachLocalWorkspaceLinearIssue
} from './linear-issue-persistence'
import type {
  LocalWorkspaceLinearIssue,
  DetachLocalWorkspaceLinearIssueArgs
} from '../../shared/local-projects/linear-issues'
import { basename } from 'node:path'
import type { StoreRuntimeState } from '../persistence/loading-store/store-runtime-state'
import type {
  CreateLocalProjectArgs,
  CreateLocalProjectResult,
  CreateLocalWorkspaceArgs,
  LocalProject,
  LocalProjectsState,
  LocalWorkspace,
  ResolvedLocalWorkspace,
  UpdateLocalProjectArgs,
  UpdateLocalWorkspaceArgs
} from '../../shared/local-projects/types'
import {
  CreateLocalProjectSchema,
  CreateLocalWorkspaceSchema,
  LocalProjectsStateSchema,
  readLocalProjectsState,
  UpdateLocalProjectSchema,
  UpdateLocalWorkspaceSchema
} from '../../shared/local-projects/schema'
import { resolveLocalWorkspace } from '../../shared/local-projects/workspace-resolution'
import { applyLocalWorkspaceMarkSlot } from '../../shared/local-projects/mark-slots'
import {
  localProjectRootScope,
  sameLocalProjectRootScope,
  type UpdateLocalProjectRootsArgs,
  type UpdateLocalWorkspaceCheckoutsArgs
} from '../../shared/local-projects/scope-update'
import {
  updateLocalProjectRoots,
  updateLocalWorkspaceCheckouts,
  type LocalWorkspaceScopeMutationGuard
} from './scope-persistence'
import {
  assertDistinctLocalDirectories,
  resolveExistingCheckoutOverrides,
  resolveExistingLocalDirectory
} from './root-validation'

type LocalProjectsRuntime = Pick<
  StoreRuntimeState,
  'state' | 'writesFrozen' | 'quitFlushStarted' | 'flushOrThrow'
>
const localProjectsContext = Symbol('LocalProjectsPersistence')

export class LocalProjectsPersistence {
  readonly [localProjectsContext]: LocalProjectsRuntime

  constructor(runtime: LocalProjectsRuntime) {
    this[localProjectsContext] = runtime
  }

  getLocalProjectsSnapshot(): LocalProjectsState {
    return readLocalProjectsState(this[localProjectsContext].state.localProjects)
  }

  resolveLocalWorkspace(workspaceId: string): ResolvedLocalWorkspace | null {
    return resolveLocalWorkspace(this.getLocalProjectsSnapshot(), workspaceId)
  }

  async createLocalProject(input: CreateLocalProjectArgs): Promise<CreateLocalProjectResult> {
    const args = CreateLocalProjectSchema.parse(input)
    const roots = await Promise.all(
      args.roots.map(async (root) => {
        const path = await resolveExistingLocalDirectory(root.path)
        return { id: root.id ?? randomUUID(), label: root.label ?? (basename(path) || path), path }
      })
    )
    assertDistinctLocalDirectories(roots.map((root) => root.path))
    const now = Date.now()
    const projectId = randomUUID()
    const workspace: LocalWorkspace = {
      id: randomUUID(),
      projectId,
      name: 'Main',
      checkoutOverridesByRootId: {},
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
    const project: LocalProject = {
      id: projectId,
      name: args.name,
      roots,
      defaultRootId: args.defaultRootId ?? roots[0].id,
      lastWorkspaceId: workspace.id,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
    const current = this.getLocalProjectsSnapshot()
    commitLocalProjects(this, {
      version: 1,
      projects: [...current.projects, project],
      workspaces: [...current.workspaces, workspace]
    })
    return structuredClone({ project, workspace })
  }

  async createLocalWorkspace(input: CreateLocalWorkspaceArgs): Promise<LocalWorkspace> {
    const args = CreateLocalWorkspaceSchema.parse(input)
    const project = requireActiveProject(this.getLocalProjectsSnapshot(), args.projectId)
    const overrides = await resolveExistingCheckoutOverrides(
      project,
      args.checkoutOverridesByRootId ?? {}
    )
    const linearIssue = args.linearIssue
      ? await readLocalWorkspaceLinearIssue(args.linearIssue)
      : undefined
    const current = this.getLocalProjectsSnapshot()
    const currentProject = requireActiveProject(current, args.projectId)
    if (
      !sameLocalProjectRootScope(
        localProjectRootScope(project),
        localProjectRootScope(currentProject)
      )
    ) {
      throw new Error('Project roots changed while creating the Workspace. Try again.')
    }
    const now = Date.now()
    const workspace: LocalWorkspace = {
      id: randomUUID(),
      projectId: project.id,
      name: args.name,
      checkoutOverridesByRootId: overrides,
      ...(linearIssue ? { linearIssues: [linearIssue] } : {}),
      ...(args.defaultRootId ? { defaultRootId: args.defaultRootId } : {}),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
    commitLocalProjects(this, {
      ...current,
      workspaces: [...current.workspaces, workspace]
    })
    return structuredClone(workspace)
  }

  updateLocalProjectRoots(
    input: UpdateLocalProjectRootsArgs,
    guard: LocalWorkspaceScopeMutationGuard
  ): Promise<LocalProjectsState> {
    return updateLocalProjectRoots(this, input, guard, (next) => commitLocalProjects(this, next))
  }

  attachLocalWorkspaceLinearIssue(
    workspaceId: string,
    issue: LocalWorkspaceLinearIssue
  ): LocalWorkspace {
    return attachLocalWorkspaceLinearIssue(this, workspaceId, issue, (next) =>
      commitLocalProjects(this, next)
    )
  }

  detachLocalWorkspaceLinearIssue(args: DetachLocalWorkspaceLinearIssueArgs): LocalWorkspace {
    return detachLocalWorkspaceLinearIssue(this, args, (next) => commitLocalProjects(this, next))
  }

  updateLocalWorkspaceCheckouts(
    input: UpdateLocalWorkspaceCheckoutsArgs,
    guard: LocalWorkspaceScopeMutationGuard
  ): Promise<LocalProjectsState> {
    return updateLocalWorkspaceCheckouts(this, input, guard, (next) =>
      commitLocalProjects(this, next)
    )
  }

  updateLocalProject(input: UpdateLocalProjectArgs): LocalProject {
    const args = UpdateLocalProjectSchema.parse(input)
    const current = this.getLocalProjectsSnapshot()
    const project = current.projects.find((entry) => entry.id === args.projectId)
    if (!project) {
      throw new Error('Local Project not found.')
    }
    if (
      (args.updates.name === undefined || args.updates.name === project.name) &&
      (args.updates.isArchived === undefined || args.updates.isArchived === project.isArchived) &&
      (args.updates.lastWorkspaceId === undefined ||
        args.updates.lastWorkspaceId === project.lastWorkspaceId)
    ) {
      return structuredClone(project)
    }
    const updated = {
      ...project,
      ...args.updates,
      updatedAt: Math.max(project.updatedAt, Date.now())
    }
    commitLocalProjects(this, {
      ...current,
      projects: current.projects.map((entry) => (entry.id === project.id ? updated : entry))
    })
    return structuredClone(updated)
  }

  updateLocalWorkspace(input: UpdateLocalWorkspaceArgs): LocalWorkspace {
    const args = UpdateLocalWorkspaceSchema.parse(input)
    const current = this.getLocalProjectsSnapshot()
    const workspace = current.workspaces.find((entry) => entry.id === args.workspaceId)
    if (!workspace) {
      throw new Error('Local Workspace not found.')
    }
    const { markSlot: requestedMarkSlot, ...updates } = args.updates
    // Archived Workspaces give up their slot so the digit shortcut never targets them.
    const { markSlot: nextMarkSlot, displaced } = applyLocalWorkspaceMarkSlot(
      current,
      workspace,
      requestedMarkSlot,
      updates.isArchived ?? workspace.isArchived
    )
    if (
      (updates.name === undefined || updates.name === workspace.name) &&
      (updates.isArchived === undefined || updates.isArchived === workspace.isArchived) &&
      (updates.isUnread === undefined || updates.isUnread === (workspace.isUnread ?? false)) &&
      (updates.isPinned === undefined || updates.isPinned === (workspace.isPinned ?? false)) &&
      (updates.lastActivityAt === undefined ||
        updates.lastActivityAt <= (workspace.lastActivityAt ?? 0)) &&
      nextMarkSlot === workspace.markSlot
    ) {
      return structuredClone(workspace)
    }
    const { markSlot: _previousMarkSlot, ...unmarked } = workspace
    const updated: LocalWorkspace = {
      ...unmarked,
      ...updates,
      ...(nextMarkSlot === undefined ? {} : { markSlot: nextMarkSlot }),
      ...(updates.lastActivityAt !== undefined
        ? { lastActivityAt: Math.max(workspace.lastActivityAt ?? 0, updates.lastActivityAt) }
        : {}),
      updatedAt: Math.max(workspace.updatedAt, Date.now())
    }
    commitLocalProjects(this, {
      ...current,
      workspaces: current.workspaces.map((entry) => {
        if (entry.id === workspace.id) {
          return updated
        }
        if (displaced.has(entry.id)) {
          const { markSlot: _taken, ...rest } = entry
          const swapped = displaced.get(entry.id)
          return swapped === undefined ? rest : { ...rest, markSlot: swapped }
        }
        return entry
      })
    })
    return structuredClone(updated)
  }
}

function requireActiveProject(state: LocalProjectsState, projectId: string): LocalProject {
  const project = state.projects.find((entry) => entry.id === projectId)
  if (!project || project.isArchived) {
    throw new Error('Choose an active local Project.')
  }
  return project
}

function commitLocalProjects(owner: LocalProjectsPersistence, value: LocalProjectsState): void {
  const runtime = owner[localProjectsContext]
  if (runtime.writesFrozen || runtime.quitFlushStarted) {
    throw new Error('Cannot change local Projects while the profile is closing.')
  }
  const next = LocalProjectsStateSchema.parse(value)
  if (
    next.workspaces.some((workspace) =>
      runtime.state.folderWorkspaces.some((folder) => folder.id === workspace.id)
    )
  ) {
    throw new Error('Local Workspace identity conflicts with an existing workspace.')
  }
  const previous = runtime.state.localProjects
  runtime.state.localProjects = next
  try {
    runtime.flushOrThrow()
  } catch (error) {
    runtime.state.localProjects = previous
    throw error
  }
}
