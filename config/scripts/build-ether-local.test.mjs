import { describe, expect, it } from 'vitest'
import { createEtherBuildPlan } from './build-ether-local.mjs'

describe('local Ether build', () => {
  it('reuses desktop build and native verification without publishing or installing the CLI', () => {
    const original = { CSC_NAME: 'Developer ID', CSC_LINK: 'private', CSC_KEY_PASSWORD: 'private' }
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
      'never'
    ])
    expect(plan.env).toMatchObject({
      ORCA_SKIP_DEV_CLI_INSTALL: '1',
      CSC_NAME: '-',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ORCA_COMPUTER_MACOS_BUNDLE_ID: 'com.joelkorpela.ether.computer-use',
      ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-'
    })
    expect(plan.env).not.toHaveProperty('CSC_LINK')
    expect(plan.env).not.toHaveProperty('CSC_KEY_PASSWORD')
    expect(original).toEqual({
      CSC_NAME: 'Developer ID',
      CSC_LINK: 'private',
      CSC_KEY_PASSWORD: 'private'
    })
    expect(plan.commands[3]).toContain('com.joelkorpela.ether')
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
