import { describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const { autoUpdaterMock, powerMonitorOnMock, chooseLocalBuildMock, moduleFactories } =
  await vi.hoisted(async () => {
    const { createUpdaterMocks } = await import('./updater-test-harness')
    return createUpdaterMocks()
  })
vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())
vi.mock('./ether-build', () => ({ getPackagedEtherProduct: () => ({ name: 'Ether' }) }))

warmUpdaterModule()

describe('Ether manual-only updates', () => {
  it('refuses automatic, manual, pinned and local updates without loading an updater', async () => {
    const updater = await loadUpdaterModule()
    const send = vi.fn()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The refused setup only retains this window and sends updater status.
    updater.setupAutoUpdater({ webContents: { send } } as never)
    updater.checkForUpdates()
    updater.checkForUpdatesFromMenu()
    updater.checkForUpdatesFromMenu({ channel: 'daily', targetTag: 'v1.2.3' })
    updater.checkForUpdatesFromMenu({ localBuild: true })
    updater.downloadUpdate()
    updater.quitAndInstall()
    expect(await updater.listAvailableReleaseBuilds('stable')).toEqual([])
    expect(updater.getRemoteServerUpdateSupport()).toMatchObject({ automatic: false })
    expect(() => updater.checkForRemoteServerUpdate('local')).toThrow(
      'remote_update_manual_required'
    )
    expect(() => updater.downloadRemoteServerUpdate('local')).toThrow(
      'remote_update_manual_required'
    )
    expect(() => updater.installRemoteServerUpdate('local')).toThrow(
      'remote_update_manual_required'
    )
    expect(autoUpdaterMock.on).not.toHaveBeenCalled()
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
    expect(powerMonitorOnMock).not.toHaveBeenCalled()
    expect(chooseLocalBuildMock).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'error',
      message: expect.stringContaining('Upstream Orca updates are disabled'),
      retryable: false,
      userInitiated: true
    })
  })
})
