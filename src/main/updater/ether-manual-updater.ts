import type { BrowserWindow } from 'electron'
import type { ReleaseBuild } from '../../shared/release-channel'
import type { ElectronAutoUpdater } from '../electron-updater-loader'
import { getPackagedEtherProduct } from '../ether-build'
import { UpdaterSetup } from './updater-setup'

export const ETHER_MANUAL_UPDATE_MESSAGE =
  'Ether updates are installed manually. Upstream Orca updates are disabled for this app.'

/** A packaged Ether never checks, downloads or installs upstream Orca updates. */
class EtherManualUpdater extends UpdaterSetup {
  private refuseUserUpdate(): void {
    this.sendStatus({
      state: 'error',
      message: ETHER_MANUAL_UPDATE_MESSAGE,
      retryable: false,
      userInitiated: true
    })
  }

  checkForUpdates(): void {}

  checkForUpdatesFromMenu(): void {
    this.refuseUserUpdate()
  }

  downloadUpdate(): void {
    this.refuseUserUpdate()
  }

  quitAndInstall(): void {
    this.refuseUserUpdate()
  }

  async listAvailableReleaseBuilds(): Promise<ReleaseBuild[]> {
    this.refuseUserUpdate()
    return []
  }

  setupAutoUpdater(mainWindow: BrowserWindow | null): void {
    this.mainWindowRef = mainWindow ?? this.mainWindowRef
  }

  protected getAutoUpdater(): ElectronAutoUpdater {
    throw new Error(ETHER_MANUAL_UPDATE_MESSAGE)
  }
}

export function createUpdaterSetup(): UpdaterSetup {
  return getPackagedEtherProduct() ? new EtherManualUpdater() : new UpdaterSetup()
}
