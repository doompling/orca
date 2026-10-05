import { describe, expect, it } from 'vitest'
import { searchWorktrees } from '@/lib/worktree-palette-search'
import { localWorkspacePaletteRows } from './local-workspace-navigation'
import { localLinearCatalog, localLinearLink } from './local-workspace-linear-test-fixtures'

function fixture() {
  const catalog = localLinearCatalog()
  catalog.workspaces[0].linearIssues = [
    localLinearLink,
    {
      ...localLinearLink,
      issueId: 'second',
      identifier: 'ENG-27',
      title: 'Recover mail delivery',
      url: 'https://linear.app/engineering/issue/ENG-27/mail'
    }
  ]
  return catalog
}

describe('canonical multi-ticket Workspace palette evidence', () => {
  it('finds every linked identifier and title through the existing matcher', () => {
    const catalog = fixture()
    const rows = localWorkspacePaletteRows(catalog)
    const result = searchWorktrees(rows, 'ENG-27', new Map())
    expect(result.map((entry) => entry.worktreeId)).toEqual(['folder:main'])
    expect(result[0].supportingText?.text).toContain('ENG-27')
    expect(result[0].supportingText?.text).toContain('Recover mail delivery')
    expect(
      searchWorktrees(rows, 'mail delivery', new Map()).map((entry) => entry.worktreeId)
    ).toEqual(['folder:main'])
    expect(searchWorktrees(rows, 'ENG-1', new Map()).map((entry) => entry.worktreeId)).toEqual(
      expect.arrayContaining(['folder:main', 'folder:investigate'])
    )
    expect(rows[0].linkedWorkItem).toBeNull()
    expect(catalog.workspaces[0].linearIssues).toHaveLength(2)
  })

  it('matches pasted URLs by saved organization and issue, never identifier alone', () => {
    const rows = localWorkspacePaletteRows(fixture())
    expect(
      searchWorktrees(rows, 'https://linear.app/engineering/issue/ENG-27', new Map()).map(
        (entry) => entry.worktreeId
      )
    ).toEqual(['folder:main'])
    expect(searchWorktrees(rows, 'https://linear.app/other/issue/ENG-27', new Map())).toEqual([])
  })

  it('keeps same-ticket Workspaces independent and removes only detached evidence', () => {
    const catalog = fixture()
    const query = localLinearLink.url
    expect(searchWorktrees(localWorkspacePaletteRows(catalog), query, new Map())).toHaveLength(2)
    catalog.workspaces[0].linearIssues = catalog.workspaces[0].linearIssues?.filter(
      (issue) => issue.issueId !== localLinearLink.issueId
    )
    expect(
      searchWorktrees(localWorkspacePaletteRows(catalog), query, new Map()).map(
        (entry) => entry.worktreeId
      )
    ).toEqual(['folder:investigate'])
    catalog.workspaces[1].isArchived = true
    expect(searchWorktrees(localWorkspacePaletteRows(catalog), query, new Map())).toEqual([])
  })

  it('does not leak local evidence to a same-ID remote owner', () => {
    const rows = localWorkspacePaletteRows(fixture()).map((row) => ({
      ...row,
      hostId: 'ssh:other' as const
    }))
    expect(searchWorktrees(rows, 'ENG-27', new Map())).toEqual([])
    expect(searchWorktrees(rows, localLinearLink.url, new Map())).toEqual([])
  })
})
