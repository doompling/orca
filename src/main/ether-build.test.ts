import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import product from '../shared/ether-product.json'
import { getDevInstanceIdentity, shouldApplyPreReadyAppName } from './startup/dev-instance-identity'

const application = vi.hoisted(() => ({
  isPackaged: true,
  getAppPath: vi.fn<() => string>(),
  getName: vi.fn(() => 'Ether')
}))
vi.mock('electron', () => ({ app: application }))
import { getPackagedEtherProduct, readEtherProductMetadata } from './ether-build'

const directories: string[] = []
function packageMetadata(value: unknown): void {
  const directory = mkdtempSync(join(tmpdir(), 'ether-build-'))
  directories.push(directory)
  writeFileSync(join(directory, 'package.json'), JSON.stringify(value))
  application.getAppPath.mockReturnValue(directory)
}

afterEach(() => {
  application.isPackaged = true
  application.getName.mockReturnValue('Ether')
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('packaged Ether identity', () => {
  it('requires the complete fork-owned marker and package name', () => {
    expect(readEtherProductMetadata({ name: 'ether', etherBuild: product })).toEqual(product)
    expect(readEtherProductMetadata({ name: 'orca' })).toBeNull()
    expect(() => readEtherProductMetadata({ name: 'orca', etherBuild: product })).toThrow()
    expect(() =>
      readEtherProductMetadata({ name: 'ether', etherBuild: { ...product, updatePolicy: 'auto' } })
    ).toThrow()
  })

  it('reads the packaged marker without using a launch environment override', () => {
    packageMetadata({ name: 'ether', etherBuild: product })
    expect(getPackagedEtherProduct()).toEqual(product)
    application.isPackaged = false
    expect(getPackagedEtherProduct()).toBeNull()
  })

  it('refuses an Ether bundle missing its identity instead of falling back to Orca', () => {
    packageMetadata({ name: 'ether' })
    expect(() => getPackagedEtherProduct()).toThrow('identity is missing')
  })

  it('leaves upstream packages and development identity unchanged', () => {
    packageMetadata({ name: 'orca' })
    application.getName.mockReturnValue('Orca')
    expect(getPackagedEtherProduct()).toBeNull()
    expect(getDevInstanceIdentity(false, {}, product)).toMatchObject({
      name: 'Ether',
      appName: 'Ether',
      appUserModelId: 'com.joelkorpela.ether'
    })
    expect(shouldApplyPreReadyAppName(getDevInstanceIdentity(false, {}, product))).toBe(false)
    expect(getDevInstanceIdentity(true, {}, product).appName).toBe('Orca Dev')
  })
})
