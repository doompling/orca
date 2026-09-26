import { ipcRenderer } from 'electron'
import type { LocalProjectsApi } from '../../shared/local-projects/types'

export const localProjectsApi = {
  getSnapshot: () => ipcRenderer.invoke('localProjects:getSnapshot'),
  createProject: (args) => ipcRenderer.invoke('localProjects:createProject', args),
  createWorkspace: (args) => ipcRenderer.invoke('localProjects:createWorkspace', args),
  createRootWorktree: (args) => ipcRenderer.invoke('localProjects:createRootWorktree', args),
  resolveWorkspace: (workspaceId) =>
    ipcRenderer.invoke('localProjects:resolveWorkspace', workspaceId),
  updateProject: (args) => ipcRenderer.invoke('localProjects:updateProject', args),
  updateWorkspace: (args) => ipcRenderer.invoke('localProjects:updateWorkspace', args),
  updateProjectRoots: (args) => ipcRenderer.invoke('localProjects:updateProjectRoots', args),
  updateWorkspaceCheckouts: (args) =>
    ipcRenderer.invoke('localProjects:updateWorkspaceCheckouts', args)
} satisfies LocalProjectsApi
