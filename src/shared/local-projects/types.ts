import type { UpdateLocalProjectRootsArgs, UpdateLocalWorkspaceCheckoutsArgs } from './scope-update'
import type {
  AttachLocalWorkspaceLinearIssueArgs,
  DetachLocalWorkspaceLinearIssueArgs,
  LocalWorkspaceLinearIssue
} from './linear-issues'
import type {
  CreateLocalRootWorktreeArgs,
  CreateLocalRootWorktreeResult
} from './worktree-creation'

export type { LocalWorkspaceLinearIssue }

export type LocalProjectRoot = {
  id: string
  label: string
  path: string
}

export type LocalProject = {
  id: string
  name: string
  roots: LocalProjectRoot[]
  defaultRootId: string
  lastWorkspaceId?: string
  isArchived: boolean
  createdAt: number
  updatedAt: number
}

export type LocalWorkspace = {
  id: string
  projectId: string
  name: string
  checkoutOverridesByRootId: Record<string, string>
  defaultRootId?: string
  isArchived: boolean
  isUnread?: boolean
  isPinned?: boolean
  lastActivityAt?: number
  linearIssues?: LocalWorkspaceLinearIssue[]
  createdAt: number
  updatedAt: number
}

export type LocalProjectsState = {
  version: 1
  projects: LocalProject[]
  workspaces: LocalWorkspace[]
}

export type ResolvedLocalWorkspace = {
  workspaceId: string
  projectId: string
  roots: LocalProjectRoot[]
  defaultRootId: string
}

export type CreateLocalProjectArgs = {
  name: string
  roots: { id?: string; path: string; label?: string }[]
  defaultRootId?: string
}

export type CreateLocalProjectResult = {
  project: LocalProject
  workspace: LocalWorkspace
}

export type CreateLocalWorkspaceArgs = {
  projectId: string
  name: string
  checkoutOverridesByRootId?: Record<string, string>
  defaultRootId?: string
}

export type UpdateLocalProjectArgs = {
  projectId: string
  updates: Partial<Pick<LocalProject, 'name' | 'isArchived' | 'lastWorkspaceId'>>
}

export type UpdateLocalWorkspaceArgs = {
  workspaceId: string
  updates: Partial<
    Pick<LocalWorkspace, 'name' | 'isArchived' | 'isUnread' | 'isPinned' | 'lastActivityAt'>
  >
}

export type LocalProjectsApi = {
  getSnapshot: () => Promise<LocalProjectsState>
  createProject: (args: CreateLocalProjectArgs) => Promise<CreateLocalProjectResult>
  createWorkspace: (args: CreateLocalWorkspaceArgs) => Promise<LocalWorkspace>
  createRootWorktree: (args: CreateLocalRootWorktreeArgs) => Promise<CreateLocalRootWorktreeResult>
  resolveWorkspace: (workspaceId: string) => Promise<ResolvedLocalWorkspace | null>
  updateProject: (args: UpdateLocalProjectArgs) => Promise<LocalProject>
  updateWorkspace: (args: UpdateLocalWorkspaceArgs) => Promise<LocalWorkspace>
  updateProjectRoots: (args: UpdateLocalProjectRootsArgs) => Promise<LocalProjectsState>
  updateWorkspaceCheckouts: (args: UpdateLocalWorkspaceCheckoutsArgs) => Promise<LocalProjectsState>
  attachLinearIssue: (args: AttachLocalWorkspaceLinearIssueArgs) => Promise<LocalWorkspace>
  detachLinearIssue: (args: DetachLocalWorkspaceLinearIssueArgs) => Promise<LocalWorkspace>
}
