import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const base = require('../electron-builder.config.cjs')
const config = require('../electron-builder.ether.config.cjs')
const product = require('../../src/shared/ether-product.json')
const { FileMatcher } = require('app-builder-lib/out/fileMatcher')
const fingerprint = 'A'.repeat(40)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Ether local Mac package', () => {
  it('has independent package, application and update identities', () => {
    expect(config.appId).toBe('com.joelkorpela.ether')
    expect(config.productName).toBe('Ether')
    expect(config.extraMetadata).toMatchObject({ name: 'ether', etherBuild: product })
    expect(config.directories.output).toBe('dist/ether')
    expect(config.protocols).toEqual([])
    expect(config.publish).toBeNull()
    expect(config.mac).toMatchObject({
      identity: process.env.ETHER_SIGN_IDENTITY || 'Ether Local Code Signing',
      timestamp: 'none',
      hardenedRuntime: false,
      notarize: false,
      target: [{ target: 'dir', arch: ['arm64'] }]
    })
    expect(config.forceCodeSigning).toBe(true)
    expect(config.afterSign).toBeUndefined()
  })

  it('excludes the development profile and old artifacts but preserves attribution', () => {
    const matcher = new FileMatcher('/app', '/dest', (value) => value, config.files)
    const filter = matcher.createFilter()
    const packs = (path) => filter(join('/app', path), { isDirectory: () => false })
    expect(packs('.orca-local-profile/profiles/local-default/orca-data.json')).toBe(false)
    expect(packs('.orca-local-profile/agent-sessions/agent-sessions.json')).toBe(false)
    expect(packs('dist/old.app/Contents/Resources/private.json')).toBe(false)
    for (const privatePath of [
      'plans/local-plan.md',
      'test-results/failure.png',
      'playwright-report/index.html',
      'reports/private.json',
      'artifacts/trace.zip',
      'debug.log',
      'my-profile/credentials.json'
    ]) {
      expect(packs(privatePath)).toBe(false)
    }
    expect(packs('LICENSE')).toBe(true)
    expect(packs('out/main/index.js')).toBe(true)
  })

  it('refuses other architectures and unverified signing before running packaging hooks', () => {
    const beforePack = vi.spyOn(base, 'beforePack').mockReturnValue(undefined)
    expect(() => config.beforePack({ electronPlatformName: 'darwin', arch: 1 })).toThrow('arm64')
    expect(() => config.beforePack({ electronPlatformName: 'win32', arch: 3 })).toThrow('arm64')
    expect(beforePack).not.toHaveBeenCalled()
    vi.stubEnv('CSC_LINK', '')
    vi.stubEnv('CSC_NAME', 'Developer ID Application: Somebody')
    expect(() => config.beforePack({ electronPlatformName: 'darwin', arch: 3 })).toThrow(
      'persistent'
    )
    vi.stubEnv('ETHER_SIGN_IDENTITY', fingerprint)
    vi.stubEnv('CSC_NAME', fingerprint)
    vi.stubEnv('CSC_IDENTITY_AUTO_DISCOVERY', 'false')
    vi.stubEnv('ORCA_COMPUTER_MACOS_SIGN_IDENTITY', fingerprint)
    const context = { electronPlatformName: 'darwin', arch: 3 }
    config.beforePack(context, '/fixture/mobile-web')
    expect(beforePack).toHaveBeenCalledExactlyOnceWith(context, '/fixture/mobile-web')
  })

  it('retains afterPack verification and marks compatibility as Ether, not upstream Orca', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ether-package-'))
    try {
      const resources = join(directory, 'Ether.app', 'Contents', 'Resources')
      await mkdir(join(resources, 'bin'), { recursive: true })
      const afterPack = vi.spyOn(base, 'afterPack').mockImplementation(async () => {
        await writeFile(join(resources, 'bin', 'orca'), 'ELECTRON="$CONTENTS/MacOS/Orca"\n')
        await writeFile(
          join(resources, 'orca-local-build.json'),
          JSON.stringify({
            appId: 'com.stablyai.orca',
            formatVersion: 1,
            daemonProtocolVersion: 36
          })
        )
      })
      const context = { appOutDir: directory, packager: { appInfo: { productFilename: 'Ether' } } }
      await config.afterPack(context)
      expect(afterPack).toHaveBeenCalledExactlyOnceWith(context)
      const launcher = await readFile(join(resources, 'bin', 'orca'), 'utf8')
      expect(launcher).toContain('ELECTRON="$CONTENTS/MacOS/Ether"')
      expect(launcher).toContain('ORCA_USER_DATA_PATH:-${HOME}/Library/Application Support/Ether')
      expect(JSON.parse(await readFile(join(resources, 'orca-local-build.json'), 'utf8'))).toEqual({
        appId: product.appId,
        formatVersion: 1,
        daemonProtocolVersion: 36
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
