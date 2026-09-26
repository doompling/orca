import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import type { AppState } from '@/store/types'
import type {
  CreateLocalProjectArgs,
  CreateLocalWorkspaceArgs,
  LocalProjectsState,
  UpdateLocalProjectArgs,
  UpdateLocalWorkspaceArgs
} from '../../../../shared/local-projects/types'
import { emptyLocalProjectsState } from '../../../../shared/local-projects/workspace-resolution'
import { hasLocalProjectsApi } from './local-projects-availability'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { findKnownWorktreeById } from '@/store/slices/worktrees/listing/detected-worktree-meta'
import {
  localProjectRootScope,
  localProjectRootScopeChangesExecution,
  localWorkspaceCheckoutScope,
  sameLocalCheckoutOverrides,
  sameLocalProjectRootScope,
  sameLocalWorkspaceCheckoutScope,
  type UpdateLocalProjectRootsArgs,
  type UpdateLocalWorkspaceCheckoutsArgs
} from '../../../../shared/local-projects/scope-update'
import { assertLocalWorkspaceScopeEditAllowed } from './local-workspace-scope-edit-guard'
import { closeObsoleteLocalWorkspaceTabs } from './local-workspace-scope-tabs'
import {
  captureLocalWorkspaceFileLayout,
  type LocalFileLayoutSnapshot
} from './local-workspace-file-layout'
import {
  applyLocalWorkspaceFileLayout,
  flushLocalWorkspaceFileTabs
} from './local-workspace-file-layout-apply'

export type LocalProjectsSlice = {
  localProjects: LocalProjectsState
  localProjectsLoaded: boolean
  localProjectsError: string | null
  fetchLocalProjects: () => Promise<void>
  createLocalProject: (args: CreateLocalProjectArgs) => Promise<void>
  createLocalWorkspace: (
    args: CreateLocalWorkspaceArgs,
    options?: { copyFileLayoutFromWorkspaceId?: string }
  ) => Promise<void>
  activateLocalWorkspace: (workspaceId: string) => Promise<void>
  updateLocalProject: (args: UpdateLocalProjectArgs) => Promise<void>
  updateLocalWorkspace: (args: UpdateLocalWorkspaceArgs) => Promise<void>
  updateLocalProjectRoots: (args: UpdateLocalProjectRootsArgs) => Promise<void>
  updateLocalWorkspaceCheckouts: (args: UpdateLocalWorkspaceCheckoutsArgs) => Promise<void>
}

function localProjectsApi() {
  const api = window.api.localProjects
  if (!api) {
    throw new Error('Local Projects are available in the desktop app.')
  }
  return api
}

export const createLocalProjectsSlice: StateCreator<AppState, [], [], LocalProjectsSlice> = (
  set,
  get
) => {
  const refreshCatalog = async () => {
    await get().fetchLocalProjects()
    await get().fetchFolderWorkspacesForAllHosts({ remoteHosts: 'skip' })
  }
  const openCreatedWorkspace = async (
    workspaceId: string,
    fileLayout?: LocalFileLayoutSnapshot
  ) => {
    try {
      await refreshCatalog()
      let copyWarning: string | null = null
      if (fileLayout) {
        flushLocalWorkspaceFileTabs(get, fileLayout.sourceWorkspaceId)
        const result = applyLocalWorkspaceFileLayout(get, set, fileLayout, workspaceId)
        copyWarning = `${result.copied} saved file tabs copied; ${result.skipped} tabs excluded. Unsaved, transient, and out-of-scope tabs were not copied.`
      }
      await get().activateLocalWorkspace(workspaceId)
      if (copyWarning) {
        toast.info(copyWarning)
      }
    } catch (error) {
      // Creation already committed; keep retrying activation separate from creating again.
      set({
        localProjectsError: `Workspace was created, but could not be opened: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
  const publishScopeEdit = async (
    previous: LocalProjectsState,
    localProjects: LocalProjectsState
  ) => {
    set({ localProjects, localProjectsError: null })
    const retained = closeObsoleteLocalWorkspaceTabs(previous, localProjects, get)
    const warning = retained
      ? `Directories were saved. ${retained} tab${retained === 1 ? '' : 's'} changed while saving and ${retained === 1 ? 'was' : 'were'} kept open with unsaved edits. Their original file paths were preserved. Copy those edits before closing the tabs or changing directories again.`
      : null
    if (warning) {
      set({ localProjectsError: warning })
    }
    try {
      await get().fetchFolderWorkspacesForAllHosts({ remoteHosts: 'skip' })
    } catch (error) {
      set({
        localProjectsError: `${warning ? `${warning} ` : ''}Directories were saved, but the Workspace list could not refresh: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  return {
    localProjects: emptyLocalProjectsState(),
    localProjectsLoaded: false,
    localProjectsError: null,
    fetchLocalProjects: async () => {
      if (!hasLocalProjectsApi()) {
        return
      }
      try {
        const localProjects = await localProjectsApi().getSnapshot()
        set({ localProjects, localProjectsLoaded: true, localProjectsError: null })
      } catch (error) {
        set({ localProjectsError: error instanceof Error ? error.message : String(error) })
        throw error
      }
    },
    createLocalProject: async (args) => {
      const { workspace } = await localProjectsApi().createProject(args)
      await openCreatedWorkspace(workspace.id)
      get().showRightSidebarFiles()
    },
    createLocalWorkspace: async (args, options) => {
      const sourceId = options?.copyFileLayoutFromWorkspaceId
      if (sourceId) {
        flushLocalWorkspaceFileTabs(get, sourceId)
      }
      const fileLayout = sourceId
        ? captureLocalWorkspaceFileLayout(get(), sourceId, args.projectId)
        : undefined
      const workspace = await localProjectsApi().createWorkspace(args)
      await openCreatedWorkspace(workspace.id, fileLayout)
    },
    activateLocalWorkspace: async (workspaceId) => {
      const workspace = get().localProjects.workspaces.find((entry) => entry.id === workspaceId)
      if (!workspace || workspace.isArchived) {
        throw new Error('Workspace is unavailable.')
      }
      const project = get().localProjects.projects.find((entry) => entry.id === workspace.projectId)
      if (!project || project.isArchived) {
        throw new Error('Project is unavailable.')
      }
      const workspaceKey = folderWorkspaceKey(workspaceId)
      if (!findKnownWorktreeById(get(), workspaceKey, 'local')) {
        throw new Error('Workspace has not loaded. Refresh Projects and try again.')
      }
      get().setActiveView('terminal')
      get().setActiveFolderWorkspace(workspaceId, 'local')
      if (get().activeWorktreeId !== workspaceKey) {
        throw new Error('Workspace could not be opened.')
      }
      if (project.lastWorkspaceId !== workspaceId) {
        await localProjectsApi().updateProject({
          projectId: workspace.projectId,
          updates: { lastWorkspaceId: workspaceId }
        })
        await get().fetchLocalProjects()
      }
    },
    updateLocalProject: async (args) => {
      await localProjectsApi().updateProject(args)
      await refreshCatalog()
    },
    updateLocalWorkspace: async (args) => {
      await localProjectsApi().updateWorkspace(args)
      await refreshCatalog()
    },
    updateLocalProjectRoots: async (args) => {
      const state = get()
      const project = state.localProjects.projects.find((entry) => entry.id === args.projectId)
      if (!project || !sameLocalProjectRootScope(localProjectRootScope(project), args.expected)) {
        throw new Error(
          'Project directories changed. Close this form and reopen it to review the current directories.'
        )
      }
      if (localProjectRootScopeChangesExecution(args.expected, args)) {
        assertLocalWorkspaceScopeEditAllowed(
          state,
          state.localProjects.workspaces
            .filter((workspace) => workspace.projectId === args.projectId)
            .map((workspace) => workspace.id)
        )
      }
      await publishScopeEdit(state.localProjects, await localProjectsApi().updateProjectRoots(args))
    },
    updateLocalWorkspaceCheckouts: async (args) => {
      const state = get()
      const workspace = state.localProjects.workspaces.find(
        (entry) => entry.id === args.workspaceId
      )
      const project = state.localProjects.projects.find(
        (entry) => entry.id === workspace?.projectId
      )
      if (
        !workspace ||
        !project ||
        !sameLocalWorkspaceCheckoutScope(
          localWorkspaceCheckoutScope(project, workspace),
          args.expected
        )
      ) {
        throw new Error(
          'Workspace directories changed. Close this form and reopen it to review the current checkouts.'
        )
      }
      if (
        args.defaultRootId !== args.expected.defaultRootId ||
        !sameLocalCheckoutOverrides(
          args.checkoutOverridesByRootId,
          args.expected.checkoutOverridesByRootId
        )
      ) {
        assertLocalWorkspaceScopeEditAllowed(state, [workspace.id])
      }
      await publishScopeEdit(
        state.localProjects,
        await localProjectsApi().updateWorkspaceCheckouts(args)
      )
    }
  }
}
