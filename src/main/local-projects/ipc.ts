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
import {
  AttachLocalWorkspaceLinearIssueSchema,
  DetachLocalWorkspaceLinearIssueSchema
} from '../../shared/local-projects/linear-issues'
import { linkLocalWorkspaceLinearIssue } from './linear-issue-linking'

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
  | 'attachLocalWorkspaceLinearIssue'
  | 'detachLocalWorkspaceLinearIssue'
  | 'whenLocalProjectsDurable'
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
    'localProjects:updateWorkspaceCheckouts',
    'localProjects:attachLinearIssue',
    'localProjects:detachLinearIssue'
  ]
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }
  // Changes apply at once; the reply waits until they are on disk, so a refused write reaches the UI.
  const durable = async <T>(value: T): Promise<T> => {
    await store.whenLocalProjectsDurable()
    return value
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
  ipcMain.handle('localProjects:updateProject', async (_event, input: unknown) => {
    const project = await durable(store.updateLocalProject(UpdateLocalProjectSchema.parse(input)))
    notifyReposChanged(mainWindow)
    return project
  })
  ipcMain.handle('localProjects:updateWorkspace', async (_event, input: unknown) => {
    const workspace = await durable(
      store.updateLocalWorkspace(UpdateLocalWorkspaceSchema.parse(input))
    )
    notifyReposChanged(mainWindow)
    return workspace
  })
  const guard = localWorkspaceScopeMutationGuard(runtime)
  ipcMain.handle('localProjects:updateProjectRoots', async (_event, input: unknown) => {
    const state = await durable(
      await store.updateLocalProjectRoots(UpdateLocalProjectRootsSchema.parse(input), guard)
    )
    notifyReposChanged(mainWindow)
    return state
  })
  ipcMain.handle('localProjects:updateWorkspaceCheckouts', async (_event, input: unknown) => {
    const state = await durable(
      await store.updateLocalWorkspaceCheckouts(
        UpdateLocalWorkspaceCheckoutsSchema.parse(input),
        guard
      )
    )
    notifyReposChanged(mainWindow)
    return state
  })
  ipcMain.handle('localProjects:attachLinearIssue', async (_event, input: unknown) => {
    const workspace = await durable(
      await linkLocalWorkspaceLinearIssue(store, AttachLocalWorkspaceLinearIssueSchema.parse(input))
    )
    notifyReposChanged(mainWindow)
    return workspace
  })
  ipcMain.handle('localProjects:detachLinearIssue', async (_event, input: unknown) => {
    const workspace = await durable(
      store.detachLocalWorkspaceLinearIssue(DetachLocalWorkspaceLinearIssueSchema.parse(input))
    )
    notifyReposChanged(mainWindow)
    return workspace
  })
}
