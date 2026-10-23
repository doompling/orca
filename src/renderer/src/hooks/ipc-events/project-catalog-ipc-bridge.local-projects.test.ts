import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state: {
    localProjectsApi: boolean
    fetchLocalProjects: () => Promise<void>
    reposChanged?: () => void
  } = { localProjectsApi: true, fetchLocalProjects: vi.fn(() => Promise.resolve()) }
  return state
})

vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({
      fetchLocalProjects: mocks.fetchLocalProjects,
      fetchRepos: vi.fn(() => Promise.resolve()),
      fetchProjectGroups: vi.fn(() => Promise.resolve()),
      fetchFolderWorkspaces: vi.fn(() => Promise.resolve())
    })
  }
}))
vi.mock('@/features/local-projects/local-projects-availability', () => ({
  hasLocalProjectsApi: () => mocks.localProjectsApi
}))

import { registerProjectCatalogIpcBridge } from './project-catalog-ipc-bridge'

function register(): void {
  const subscribe = () => () => {}
  const namespaces: Record<string, unknown> = {
    repos: {
      onChanged: (listener: () => void) => {
        mocks.reposChanged = listener
        return () => {}
      }
    }
  }
  const api = new Proxy(namespaces, {
    get: (target, prop: string) => target[prop] ?? new Proxy({}, { get: () => subscribe })
  })
  vi.stubGlobal('window', { api })
  registerProjectCatalogIpcBridge(
    [],
    { dispose: vi.fn(), enqueue: vi.fn() },
    () => false,
    () => {}
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('repos:changed refreshes local Projects', () => {
  it.each([true, false])('fetches the local catalog only when its API exists (%s)', (available) => {
    mocks.localProjectsApi = available
    register()
    mocks.reposChanged?.()
    expect(mocks.fetchLocalProjects).toHaveBeenCalledTimes(available ? 1 : 0)
  })
})
