import { describe, expect, it } from 'vitest'
import type { AgentRowState } from '../../../../shared/agent-row-decay-state'
import type {
  LocalProject,
  LocalProjectsState,
  LocalWorkspace
} from '../../../../shared/local-projects/types'
import {
  buildLocalSidebarModel,
  checkoutOverrideLabel,
  formatLocalSidebarAge,
  holdRowOrder,
  localWorkspaceMarkSlots,
  localWorkspacesByRecentVisit,
  nextFreeMarkSlot,
  partitionLocalSidebarAgents,
  pickLocalWorkspaceSuccessor
} from './local-sidebar-model'

function project(id: string, extra: Partial<LocalProject> = {}): LocalProject {
  return {
    id,
    name: id,
    roots: [{ id: 'root', label: 'root', path: `/code/${id}` }],
    defaultRootId: 'root',
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

function workspace(
  id: string,
  projectId: string,
  extra: Partial<LocalWorkspace> = {}
): LocalWorkspace {
  return {
    id,
    projectId,
    name: id,
    checkoutOverridesByRootId: {},
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

function catalog(workspaces: LocalWorkspace[], projects = [project('a'), project('b')]) {
  const state: LocalProjectsState = { version: 1, projects, workspaces }
  return state
}

const ids = (rows: { workspace: LocalWorkspace }[]) => rows.map((row) => row.workspace.id)

describe('buildLocalSidebarModel', () => {
  it('keeps Projects in catalog order and sorts Workspaces by the freshest activity signal', () => {
    const state = catalog([
      workspace('old', 'a', { lastActivityAt: 10 }),
      workspace('new', 'a', { createdAt: 50 }),
      workspace('live', 'a', { lastActivityAt: 5 }),
      workspace('other', 'b')
    ])
    const model = buildLocalSidebarModel(
      state,
      [{ id: 'live', isUnread: true, lastActivityAt: 99 }],
      { showArchived: false }
    )
    expect(model.projects.map((group) => group.project.id)).toEqual(['a', 'b'])
    expect(ids(model.projects[0].rows)).toEqual(['live', 'new', 'old'])
    expect(model.projects[0].rows[0]).toMatchObject({
      worktreeId: 'folder:live',
      activityAt: 99,
      isUnread: true
    })
  })

  it('moves marked Workspaces out of their Project and orders marks by slot', () => {
    const state = catalog([
      workspace('two', 'a', { markSlot: 2 }),
      workspace('one', 'b', { markSlot: 1 }),
      workspace('plain', 'a')
    ])
    const model = buildLocalSidebarModel(state, [], { showArchived: false })
    expect(ids(model.marks)).toEqual(['one', 'two'])
    expect(ids(model.projects[0].rows)).toEqual(['plain'])
    expect(model.projects[1].rows).toEqual([])
  })

  it('hides archived records unless asked and never lists them as marks', () => {
    const state = catalog(
      [
        workspace('gone', 'a', { isArchived: true }),
        workspace('kept', 'a'),
        workspace('in-archived-project', 'b', { markSlot: 3 })
      ],
      [project('a'), project('b', { isArchived: true })]
    )
    const hidden = buildLocalSidebarModel(state, [], { showArchived: false })
    expect(hidden.marks).toEqual([])
    expect(hidden.projects.map((group) => group.project.id)).toEqual(['a'])
    expect(ids(hidden.projects[0].rows)).toEqual(['kept'])
    const shown = buildLocalSidebarModel(state, [], { showArchived: true })
    expect(ids(shown.projects[0].rows)).toEqual(['kept', 'gone'])
    expect(ids(shown.projects[1].rows)).toEqual(['in-archived-project'])
  })
})

describe('mark slots', () => {
  it('leaves holes so digits never shift and finds the first free slot', () => {
    const state = catalog([
      workspace('x', 'a', { markSlot: 3 }),
      workspace('y', 'a', { markSlot: 1 })
    ])
    const slots = localWorkspaceMarkSlots(state)
    expect(slots).toHaveLength(9)
    expect(slots.map((entry) => entry.workspace?.id ?? null).slice(0, 4)).toEqual([
      'y',
      null,
      'x',
      null
    ])
    expect(slots[2].slot).toBe(3)
    expect(nextFreeMarkSlot(state)).toBe(2)
    const full = catalog(
      Array.from({ length: 9 }, (_, index) => workspace(`w${index}`, 'a', { markSlot: index + 1 }))
    )
    expect(nextFreeMarkSlot(full)).toBeNull()
  })
})

describe('recent visits and archive successor', () => {
  const state = catalog([
    workspace('open', 'a'),
    workspace('sibling', 'a'),
    workspace('elsewhere', 'b', { createdAt: 9 }),
    workspace('archived', 'a', { isArchived: true })
  ])

  it('orders by last visit, then newest never-visited', () => {
    const visits: Record<string, number> = { 'folder:open': 30, 'folder:sibling': 10 }
    const order = localWorkspacesByRecentVisit(state, (id) => visits[id])
    expect(order.map((entry) => entry.id)).toEqual(['open', 'sibling', 'elsewhere'])
  })

  it('goes to the last visited Workspace, then a sibling, never an archived one', () => {
    const visits: Record<string, number> = { 'folder:elsewhere': 20, 'folder:open': 30 }
    expect(pickLocalWorkspaceSuccessor(state, 'open', (id) => visits[id])?.id).toBe('elsewhere')
    expect(pickLocalWorkspaceSuccessor(state, 'open', () => undefined)?.id).toBe('sibling')
    expect(pickLocalWorkspaceSuccessor(catalog([workspace('only', 'a')]), 'only', () => 1)).toBe(
      null
    )
  })
})

describe('partitionLocalSidebarAgents', () => {
  const states: AgentRowState[] = ['working', 'idle', 'done', 'waiting', 'unverifiable', 'blocked']
  const agents = states.map((state) => ({ state }))

  it('shows everything for the open Workspace', () => {
    expect(partitionLocalSidebarAgents(agents, { isActive: true, isUnread: false })).toEqual({
      shown: agents,
      hiddenCount: 0
    })
  })

  it('keeps agents that need attention and folds idle or seen ones', () => {
    const seen = partitionLocalSidebarAgents(agents, { isActive: false, isUnread: false })
    expect(seen.shown.map((agent) => agent.state)).toEqual([
      'working',
      'waiting',
      'unverifiable',
      'blocked'
    ])
    expect(seen.hiddenCount).toBe(2)
    const unseen = partitionLocalSidebarAgents(agents, { isActive: false, isUnread: true })
    expect(unseen.shown.map((agent) => agent.state)).toContain('done')
  })
})

describe('labels', () => {
  it('formats compact ages with weeks', () => {
    const now = 100 * 86_400_000
    expect(formatLocalSidebarAge(now - 30_000, now)).toBe('now')
    expect(formatLocalSidebarAge(now - 5 * 60_000, now)).toBe('5m')
    expect(formatLocalSidebarAge(now - 3 * 86_400_000, now)).toBe('3d')
    expect(formatLocalSidebarAge(now - 15 * 86_400_000, now)).toBe('2w')
  })

  it('names a checkout override by its folder on any platform', () => {
    expect(checkoutOverrideLabel('/code/app-fix/')).toBe('app-fix')
    expect(checkoutOverrideLabel('C:\\code\\app-fix')).toBe('app-fix')
  })

  it('holds a previous order and appends new rows', () => {
    const rows = [{ worktreeId: 'c' }, { worktreeId: 'a' }, { worktreeId: 'new' }]
    expect(holdRowOrder(rows, ['a', 'c']).map((row) => row.worktreeId)).toEqual(['a', 'c', 'new'])
    expect(holdRowOrder(rows, undefined)).toEqual(rows)
  })
})
