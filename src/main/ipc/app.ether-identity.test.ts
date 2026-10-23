import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EtherProduct } from '../ether-build'
import etherProduct from '../../shared/ether-product.json'

const { handlers, electronApp, getPackagedEtherProductMock } = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>(),
  electronApp: { isPackaged: false, getAppPath: () => '/test/app' },
  getPackagedEtherProductMock: vi.fn<() => EtherProduct | null>(() => null)
}))

vi.mock('electron', () => ({
  app: electronApp,
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))
vi.mock('../ether-build', () => ({ getPackagedEtherProduct: getPackagedEtherProductMock }))
vi.mock('../tray/system-tray', () => ({
  destroySystemTray: vi.fn(),
  rebuildSystemTrayMenu: vi.fn()
}))
vi.mock('../menu/register-app-menu', () => ({ rebuildAppMenu: vi.fn() }))
vi.mock('../i18n/system-language', () => ({ getSystemLanguageDetection: vi.fn() }))
vi.mock('../i18n/main-i18n', () => ({ setMainUiLanguage: vi.fn() }))
vi.mock('../windows/windows-administrator-restart', () => ({
  prepareWindowsAdministratorRestart: vi.fn()
}))
vi.mock('./floating-workspace-directory', () => ({
  ensureDefaultFloatingWorkspacePath: vi.fn(),
  trustFloatingWorkspaceDirectory: vi.fn(),
  resolveFloatingTerminalCwd: vi.fn()
}))
vi.mock('./renderer-shutdown-checkpoint', () => ({
  registerRendererShutdownCheckpointHandler: vi.fn()
}))
vi.mock('./macos-keyboard-layout-change-notifications', () => ({
  registerMacKeyboardLayoutChangeNotifications: vi.fn()
}))
vi.mock('../wsl', () => ({
  isWslAvailableAsync: vi.fn(async () => false),
  listWslDistros: vi.fn(() => []),
  listWslDistrosAsync: vi.fn(async () => [])
}))
vi.mock('../pwsh', () => ({
  isPwshAvailable: vi.fn(() => false),
  isPwshAvailableAsync: vi.fn(async () => false)
}))

import { registerAppHandlers } from './app'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: app:getIdentity, the only handler called here, never reads the store.
const store = {} as never

function identity(): unknown {
  return handlers.get('app:getIdentity')?.(null)
}

beforeEach(() => {
  handlers.clear()
  electronApp.isPackaged = false
  getPackagedEtherProductMock.mockReset().mockReturnValue(null)
})

describe('Ether app identity', () => {
  it('publishes the packaged Ether identity through the existing app bridge', () => {
    electronApp.isPackaged = true
    getPackagedEtherProductMock.mockReturnValue(etherProduct)
    registerAppHandlers(store)

    expect(identity()).toEqual({
      name: 'Ether',
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null
    })
  })

  it('preserves upstream packaged and development identities', () => {
    electronApp.isPackaged = true
    registerAppHandlers(store)
    expect(identity()).toMatchObject({ name: 'Orca', isDev: false })

    electronApp.isPackaged = false
    getPackagedEtherProductMock.mockReturnValue(etherProduct)
    expect(identity()).toMatchObject({ name: expect.stringContaining('Orca'), isDev: true })
  })
})
