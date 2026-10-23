import { describe, expect, it } from 'vitest'
import {
  createEtherBuildPlan,
  etherReleaseRow,
  nextEtherReleaseId,
  RELEASES_README
} from './build-ether-local.mjs'

const fingerprint = 'A'.repeat(40)

describe('local Ether build', () => {
  it('reuses desktop build and native verification without publishing or installing the CLI', () => {
    const original = {
      ETHER_SIGN_IDENTITY: fingerprint,
      CSC_NAME: 'Developer ID',
      CSC_LINK: 'private',
      CSC_KEY_PASSWORD: 'private'
    }
    const plan = createEtherBuildPlan({ platform: 'darwin', arch: 'arm64', environment: original })
    expect(plan.commands[0]).toEqual(['run', 'build:desktop'])
    expect(plan.commands.at(-2)).toEqual(['run', 'ensure:electron-runtime'])
    expect(plan.commands.at(-1)).toEqual([
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.ether.config.cjs',
      '--mac',
      '--arm64',
      '--dir',
      '--publish',
      'never',
      '--config.directories.output=dist/ether-build'
    ])
    expect(plan.env).toMatchObject({
      ORCA_SKIP_DEV_CLI_INSTALL: '1',
      ETHER_SIGN_IDENTITY: fingerprint,
      CSC_NAME: fingerprint,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ORCA_COMPUTER_MACOS_BUNDLE_ID: 'com.joelkorpela.ether.computer-use',
      ORCA_COMPUTER_MACOS_SIGN_IDENTITY: fingerprint
    })
    expect(plan.env).not.toHaveProperty('CSC_LINK')
    expect(plan.env).not.toHaveProperty('CSC_KEY_PASSWORD')
    expect(original).toEqual({
      ETHER_SIGN_IDENTITY: fingerprint,
      CSC_NAME: 'Developer ID',
      CSC_LINK: 'private',
      CSC_KEY_PASSWORD: 'private'
    })
    expect(plan.commands[3]).toContain('com.joelkorpela.ether')
  })

  it('defaults to the persistent local certificate and builds into scratch, never a release', () => {
    const plan = createEtherBuildPlan({ platform: 'darwin', arch: 'arm64', environment: {} })
    expect(plan.env.CSC_NAME).toBe('Ether Local Code Signing')
    expect(plan.env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY).toBe(plan.env.CSC_NAME)
    expect(plan.outputDirectory).toBe('dist/ether-build')
  })

  it('names each release by local date and commit and never reuses a folder', () => {
    const date = new Date(2026, 9, 3, 23, 59)
    const taken = new Set(['2026-10-03-ae81434245', '2026-10-03-ae81434245-2'])
    expect(nextEtherReleaseId({ commit: 'ae814342452f', date, exists: () => false })).toBe(
      '2026-10-03-ae81434245'
    )
    expect(
      nextEtherReleaseId({ commit: 'ae814342452f', date, exists: (id) => taken.has(id) })
    ).toBe('2026-10-03-ae81434245-3')
  })

  it('logs each release as one table row with a safe commit subject', () => {
    expect(RELEASES_README).toContain('| Release | Version | Commit |')
    expect(
      etherReleaseRow(
        '2026-10-03-ae81434245',
        { version: '1.4.197-local.1.ae814342452f', commit: 'ae814342452f' },
        'Fix a | b'
      )
    ).toBe(
      '| `2026-10-03-ae81434245` | `1.4.197-local.1.ae814342452f` | ae81434245 Fix a \\| b |\n'
    )
  })

  it.each(['', ' ', '-', 'unsafe\nidentity'])('refuses invalid signing selector %j', (selector) => {
    expect(() =>
      createEtherBuildPlan({
        platform: 'darwin',
        arch: 'arm64',
        environment: { ETHER_SIGN_IDENTITY: selector }
      })
    ).toThrow('persistent')
  })

  it.each([
    ['linux', 'arm64'],
    ['win32', 'x64'],
    ['darwin', 'x64']
  ])('refuses unsupported host %s/%s before starting a build', (platform, arch) => {
    expect(() => createEtherBuildPlan({ platform, arch, environment: {} })).toThrow('Apple Silicon')
  })

  it.each(['ORCA_MAC_RELEASE', 'ORCA_MAC_HOURLY', 'ORCA_MAC_DAILY', 'ORCA_WIN_ADHOC'])(
    'refuses inherited release flag %s',
    (flag) => {
      expect(() =>
        createEtherBuildPlan({
          platform: 'darwin',
          arch: 'arm64',
          environment: { [flag]: '1' }
        })
      ).toThrow(flag)
    }
  )
})
