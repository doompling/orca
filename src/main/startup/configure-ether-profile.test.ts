import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  appData: '',
  userData: '',
  ether: true
}))
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'appData' ? state.appData : state.userData),
    setPath: (name: string, value: string) => {
      if (name === 'userData') {
        state.userData = value
      }
    }
  }
}))
vi.mock('../ether-build', () => ({
  getPackagedEtherProduct: () => (state.ether ? { name: 'Ether' } : null)
}))
vi.mock('../e2e-config', () => ({ getMainE2EConfig: () => ({}) }))
vi.mock('../codex-cli/command', () => ({ getVersionManagerBinPaths: () => [] }))
import { configureDevUserDataPath, configureOrcaUserDataPathEnv } from './configure-process'

beforeEach(() => {
  state.appData = mkdtempSync(join(tmpdir(), 'ether-profile-'))
})

afterEach(() => {
  rmSync(state.appData, { recursive: true, force: true })
  vi.unstubAllEnvs()
  state.ether = true
})

describe('Ether startup profile boundary', () => {
  it('selects Ether before publishing the runtime profile environment', () => {
    state.userData = join(state.appData, 'Orca')
    vi.stubEnv('ORCA_DEV_USER_DATA_PATH', undefined)
    vi.stubEnv('ORCA_USER_DATA_PATH', state.userData)
    configureDevUserDataPath(false)
    configureOrcaUserDataPathEnv()
    expect(state.userData).toBe(join(state.appData, 'Ether'))
    expect(existsSync(state.userData)).toBe(true)
    expect(existsSync(join(state.appData, 'Orca'))).toBe(false)
    expect(process.env.ORCA_USER_DATA_PATH).toBe(state.userData)
  })

  it('honors the packaged hidden-test override without selecting the development profile', () => {
    const profile = join(state.appData, 'isolated-ether-test')
    vi.stubEnv('ORCA_DEV_USER_DATA_PATH', profile)
    configureDevUserDataPath(false)
    expect(state.userData).toBe(profile)
  })

  it('leaves upstream packaged behavior unchanged', () => {
    state.ether = false
    state.userData = join(state.appData, 'upstream-profile')
    configureDevUserDataPath(false)
    expect(state.userData).toBe(join(state.appData, 'upstream-profile'))
  })
})
