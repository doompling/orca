import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import {
  captureLocalWorkspaceFileLayout,
  filterLocalWorkspaceFileLayout
} from './local-workspace-file-layout'
import { fileLayoutFixture } from './local-workspace-file-layout.test-fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('clean local file layout snapshots', () => {
  it('captures a detached whitelist with clean tab order, active selection and split ratio', () => {
    const { store, sourceKey } = fileLayoutFixture()
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    expect(snapshot.groups[0].files.map((file) => file.relativePath)).toEqual(['c.txt', 'a.txt'])
    expect(snapshot.groups[0].activeTabId).toBe('tab-file-a')
    expect(snapshot.activeGroupId).toBe('right')
    expect(snapshot.skipped).toBe(1)
    expect(snapshot.layout).toMatchObject({ type: 'split', direction: 'horizontal', ratio: 0.35 })
    store.setState({
      openFiles: [],
      layoutByWorktree: { [sourceKey]: { type: 'leaf', groupId: 'other' } }
    })
    expect(snapshot.groups).toHaveLength(2)
    expect(JSON.stringify(snapshot)).not.toContain('source-signature')
    expect(JSON.stringify(snapshot)).not.toContain('do-not-copy-provider-session')
  })

  it.each<Partial<OpenFile>>([
    { isDirty: true },
    { isUntitled: true },
    { isPreview: true },
    { mode: 'markdown-preview' },
    { mode: 'diff' },
    { externalMutation: 'deleted' },
    { externalMutation: 'renamed' },
    { externalMutation: 'changed' },
    { runtimeEnvironmentId: 'ssh' },
    { externalSshTargetId: 'ssh' },
    { mirroredFromRuntimeSession: true },
    { readOnly: true },
    { liveTail: true },
    { markdownPreviewSourceFileId: 'draft-owner' },
    { pendingOwnerMigration: true },
    { pendingDiskBaselineVerification: true },
    { pendingLiveDiskVerification: true }
  ])('excludes ineligible source file state %j', (flag) => {
    const { store } = fileLayoutFixture()
    store.setState({
      openFiles: store
        .getState()
        .openFiles.map((file) => (file.id === 'file-b' ? { ...file, ...flag } : file))
    })
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    expect(snapshot.groups).toHaveLength(1)
    expect(snapshot.layout).toEqual({ type: 'leaf', groupId: 'left' })
    expect(snapshot.skipped).toBe(2)
  })

  it('excludes even an empty retained draft and does not alias it into the snapshot', () => {
    const { store } = fileLayoutFixture()
    store.setState({ editorDrafts: { 'file-b': '' } })
    expect(
      captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project').groups
    ).toHaveLength(1)
    expect(store.getState().editorDrafts).toEqual({ 'file-b': '' })
  })

  it('rechecks dirtiness after capture and excludes checkout overrides without remapping paths', () => {
    const { store, catalog } = fileLayoutFixture()
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    catalog.workspaces[1].checkoutOverridesByRootId = { a: '/alternate-a' }
    store.setState({ localProjects: catalog })
    const filtered = filterLocalWorkspaceFileLayout(store.getState(), snapshot, 'copy')
    expect(filtered.groups[0].files.map((file) => file.filePath)).toEqual(['/b/b.txt'])
    expect(filtered.layout).toEqual({ type: 'leaf', groupId: 'right' })
    expect(filtered.skipped).toBe(3)
    store.setState({ editorDrafts: { 'file-b': 'unsaved now' } })
    expect(filterLocalWorkspaceFileLayout(store.getState(), snapshot, 'copy').layout).toBeNull()
  })

  it('refuses changed profiles, archived sources and another Project', () => {
    const { store, catalog } = fileLayoutFixture()
    const snapshot = captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')
    store.setState({ activeOrcaProfileId: 'other-profile' })
    expect(() => filterLocalWorkspaceFileLayout(store.getState(), snapshot, 'copy')).toThrow(
      'profile'
    )
    expect(() =>
      captureLocalWorkspaceFileLayout(store.getState(), 'main', 'other-project')
    ).toThrow('source Workspace')
    catalog.workspaces[0].isArchived = true
    store.setState({ localProjects: catalog })
    expect(() => captureLocalWorkspaceFileLayout(store.getState(), 'main', 'project')).toThrow(
      'source Workspace'
    )
  })
})
