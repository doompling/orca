import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquire, release } from './linear-request-concurrency'
import { LINEAR_READ_TIMEOUT_MS } from './linear-read-deadline'
import {
  createProject,
  getCustomView,
  getProject,
  listCustomViews,
  listProjects,
  listProjectsByExactName
} from './projects'
import { getIssue, searchIssues } from './linear-issue-lookups'

vi.mock('./linear-workspace-registry', () => ({
  getWorkspaceState: () => ({
    workspaces: [
      {
        id: 'deadline-account',
        organizationId: 'deadline-account',
        organizationName: 'Deadline fixture',
        displayName: 'Fixture',
        email: null
      }
    ]
  }),
  resolveWorkspaceId: (workspaceId?: string) => workspaceId ?? 'deadline-account'
}))

vi.mock('./linear-token-store', () => ({
  loadToken: () => 'deadline-fixture-not-a-real-key',
  clearToken: vi.fn()
}))

const account = 'deadline-account'
const reads = [
  { name: 'projects', run: () => listProjects(undefined, 36, account) },
  { name: 'project search', run: () => listProjects('release', 36, account) },
  { name: 'exact project search', run: () => listProjectsByExactName('release', account) },
  { name: 'project detail', run: () => getProject('project-a', account) },
  { name: 'issue views', run: () => listCustomViews('issue', 36, account) },
  { name: 'project views', run: () => listCustomViews('project', 36, account) },
  { name: 'view detail', run: () => getCustomView('view-a', 'issue', account) },
  { name: 'issue search', run: () => searchIssues('release', 20, account) },
  { name: 'issue detail', run: () => getIssue('ISS-1', account) }
]

function stalledFetch() {
  const signals: AbortSignal[] = []
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
    const signal = init?.signal
    if (!signal) {
      return Promise.reject(new Error('Read did not provide a transport abort signal'))
    }
    signals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, signals }
}

function projectResponse() {
  return new Response(
    JSON.stringify({
      data: {
        projects: {
          nodes: [{ id: 'project-a', name: 'Recovered project' }],
          pageInfo: { hasNextPage: false }
        }
      }
    }),
    { headers: { 'content-type': 'application/json' } }
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Linear read deadlines with the real SDK', () => {
  it.each(reads)('aborts a stalled $name transport with a retryable error', async ({ run }) => {
    const { fetch, signals } = stalledFetch()
    const result = expect(run()).rejects.toThrow(
      'Linear read timed out after 30 seconds. Check your connection and refresh to retry.'
    )
    await vi.advanceTimersByTimeAsync(LINEAR_READ_TIMEOUT_MS)
    await result
    expect(fetch).toHaveBeenCalledOnce()
    expect(signals[0]?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the coalesced request and creates a fresh signal on a healthy retry', async () => {
    const { fetch, signals } = stalledFetch()
    const first = expect(listProjects(undefined, 36, account)).rejects.toThrow('timed out')
    const joined = expect(listProjects(undefined, 36, account)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(LINEAR_READ_TIMEOUT_MS)
    await Promise.all([first, joined])
    expect(fetch).toHaveBeenCalledOnce()
    fetch.mockImplementation(async (_url, init) => {
      expect(init?.signal?.aborted).toBe(false)
      expect(init?.signal).not.toBe(signals[0])
      return projectResponse()
    })
    await expect(listProjects(undefined, 36, account)).resolves.toMatchObject({
      items: [{ id: 'project-a', name: 'Recovered project', workspaceId: account }]
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds time waiting for a slot and removes the cancelled queued read', async () => {
    for (let slot = 0; slot < 4; slot++) {
      await acquire()
    }
    const { fetch } = stalledFetch()
    try {
      const result = expect(listProjects(undefined, 36, account)).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(LINEAR_READ_TIMEOUT_MS)
      await result
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      for (let slot = 0; slot < 4; slot++) {
        release()
      }
    }
    fetch.mockImplementation(async () => projectResponse())
    await expect(listProjects(undefined, 36, account)).resolves.toMatchObject({
      items: [{ id: 'project-a' }]
    })
    expect(fetch).toHaveBeenCalledOnce()
    for (let slot = 0; slot < 4; slot++) {
      await acquire()
    }
    for (let slot = 0; slot < 4; slot++) {
      release()
    }
  })

  it('releases occupied slots after aborting stalled transports', async () => {
    const { fetch, signals } = stalledFetch()
    const pending = Array.from({ length: 4 }, (_, index) =>
      expect(listProjects(`pending-${index}`, 36, account)).rejects.toThrow('timed out')
    )
    await vi.advanceTimersByTimeAsync(LINEAR_READ_TIMEOUT_MS)
    await Promise.all(pending)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    fetch.mockImplementation(async () => projectResponse())
    await expect(listProjects(undefined, 36, account)).resolves.toMatchObject({
      items: [{ id: 'project-a' }]
    })
  })

  it('does not apply read deadlines or retries to project creation', async () => {
    let complete!: (response: Response) => void
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
      expect(init?.signal).toBeUndefined()
      return new Promise((resolve) => {
        complete = resolve
      })
    })
    vi.stubGlobal('fetch', fetch)
    const pending = createProject({ name: 'Fixture project', teamIds: ['team-a'] }, account)
    await vi.advanceTimersByTimeAsync(LINEAR_READ_TIMEOUT_MS)
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    complete(
      new Response(
        JSON.stringify({
          data: {
            projectCreate: {
              success: true,
              project: { id: 'new-project', name: 'Fixture project' }
            }
          }
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    )
    await expect(pending).resolves.toMatchObject({ ok: true, project: { id: 'new-project' } })
  })
})
