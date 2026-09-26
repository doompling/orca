import { ipcMain, type BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import {
  CreateLocalProjectSchema,
  CreateLocalWorkspaceSchema,
  LocalWorkspaceIdSchema,
  UpdateLocalProjectSchema,
  UpdateLocalWorkspaceSchema
} from '../../shared/local-projects/schema'
import { notifyReposChanged } from '../ipc/repos/repos-changed-notification'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  UpdateLocalProjectRootsSchema,
  UpdateLocalWorkspaceCheckoutsSchema
} from '../../shared/local-projects/scope-update'
import { localWorkspaceScopeMutationGuard } from './scope-mutation-guard'
import { CreateLocalRootWorktreeSchema } from '../../shared/local-projects/worktree-creation'
import { createLocalRootWorktree } from './root-worktree-creation'

type LocalProjectIpcStore = Pick<
  Store,
  | 'getLocalProjectsSnapshot'
  | 'createLocalProject'
  | 'createLocalWorkspace'
  | 'resolveLocalWorkspace'
  | 'updateLocalProject'
  | 'updateLocalWorkspace'
  | 'updateLocalProjectRoots'
  | 'updateLocalWorkspaceCheckouts'
>

export function registerLocalProjectHandlers(
  mainWindow: BrowserWindow,
  store: LocalProjectIpcStore,
  runtime: Pick<OrcaRuntimeService, 'acquireWorktreeTerminalMutation' | 'listTerminals'>
): void {
  const channels = [
    'localProjects:getSnapshot',
    'localProjects:createProject',
    'localProjects:createWorkspace',
    'localProjects:createRootWorktree',
    'localProjects:resolveWorkspace',
    'localProjects:updateProject',
    'localProjects:updateWorkspace',
    'localProjects:updateProjectRoots',
    'localProjects:updateWorkspaceCheckouts'
  ]
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('localProjects:getSnapshot', () => store.getLocalProjectsSnapshot())
  ipcMain.handle('localProjects:createProject', async (_event, input: unknown) => {
    const result = await store.createLocalProject(CreateLocalProjectSchema.parse(input))
    notifyReposChanged(mainWindow)
    return result
  })
  ipcMain.handle('localProjects:createWorkspace', async (_event, input: unknown) => {
    const workspace = await store.createLocalWorkspace(CreateLocalWorkspaceSchema.parse(input))
    notifyReposChanged(mainWindow)
    return workspace
  })
  ipcMain.handle('localProjects:createRootWorktree', (_event, input: unknown) =>
    createLocalRootWorktree(store, CreateLocalRootWorktreeSchema.parse(input))
  )
  ipcMain.handle('localProjects:resolveWorkspace', (_event, workspaceId: unknown) =>
    store.resolveLocalWorkspace(LocalWorkspaceIdSchema.parse(workspaceId))
  )
  ipcMain.handle('localProjects:updateProject', (_event, input: unknown) => {
    const project = store.updateLocalProject(UpdateLocalProjectSchema.parse(input))
    notifyReposChanged(mainWindow)
    return project
  })
  ipcMain.handle('localProjects:updateWorkspace', (_event, input: unknown) => {
    const workspace = store.updateLocalWorkspace(UpdateLocalWorkspaceSchema.parse(input))
    notifyReposChanged(mainWindow)
    return workspace
  })
  const guard = localWorkspaceScopeMutationGuard(runtime)
  ipcMain.handle('localProjects:updateProjectRoots', async (_event, input: unknown) => {
    const state = await store.updateLocalProjectRoots(
      UpdateLocalProjectRootsSchema.parse(input),
      guard
    )
    notifyReposChanged(mainWindow)
    return state
  })
  ipcMain.handle('localProjects:updateWorkspaceCheckouts', async (_event, input: unknown) => {
    const state = await store.updateLocalWorkspaceCheckouts(
      UpdateLocalWorkspaceCheckoutsSchema.parse(input),
      guard
    )
    notifyReposChanged(mainWindow)
    return state
  })
}
