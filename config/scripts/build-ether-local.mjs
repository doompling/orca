#!/usr/bin/env node
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import product from '../../src/shared/ether-product.json' with { type: 'json' }
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const bundleId = product.appId

export function createEtherBuildPlan({
  platform = process.platform,
  arch = process.arch,
  environment = process.env
} = {}) {
  if (platform !== 'darwin' || arch !== 'arm64') {
    throw new Error('This Ether build targets the current Apple Silicon Mac only.')
  }
  for (const [key, value] of Object.entries(environment)) {
    if (/^ORCA_(MAC|WIN)_(RELEASE|HOURLY|DAILY|ADHOC)$/.test(key) && value === '1') {
      throw new Error(`Unset ${key}: Ether is a local build, not an upstream release.`)
    }
  }
  const env = {
    ...environment,
    ORCA_SKIP_DEV_CLI_INSTALL: '1',
    ORCA_COMPUTER_MACOS_BUNDLE_ID: `${bundleId}.computer-use`,
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: '-',
    CSC_NAME: '-',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }
  delete env.CSC_LINK
  delete env.CSC_KEY_PASSWORD
  return {
    env,
    commands: [
      ['run', 'build:desktop'],
      ['run', 'build:computer-macos'],
      ['exec', 'node', 'config/scripts/build-keyboard-layout-macos.mjs', '--single-arch'],
      [
        'exec',
        'node',
        'config/scripts/build-notification-status-macos.mjs',
        '--single-arch',
        '--bundle-id',
        bundleId
      ],
      ['run', 'ensure:electron-runtime'],
      [
        'exec',
        'electron-builder',
        '--config',
        'config/electron-builder.ether.config.cjs',
        '--mac',
        '--arm64',
        '--dir',
        '--publish',
        'never'
      ]
    ]
  }
}

async function buildEther() {
  const plan = createEtherBuildPlan()
  process.chdir(repoRoot)
  const identity = getLocalBuildIdentity()
  plan.env.ORCA_LOCAL_BUILD_VERSION = identity.version
  plan.env.ORCA_BUILD_COMMIT = identity.commit
  const { command, prefixArgs } = resolvePnpmCliInvocation()
  const { spawnProcess } = await createJiti(import.meta.url).import(
    '../../src/shared/child-process/run-process.ts'
  )
  for (const args of plan.commands) {
    console.log(`[Ether] ${command} ${[...prefixArgs, ...args].join(' ')}`)
    await new Promise((done, fail) => {
      const child = spawnProcess({
        program: command,
        args: [...prefixArgs, ...args],
        cwd: repoRoot,
        env: plan.env,
        stdio: 'inherit'
      })
      child.once('error', fail)
      child.once('close', (code, signal) => {
        if (code === 0) {
          done()
        } else {
          fail(new Error(`Ether build stopped (${signal ?? `exit ${code}`}): ${args.join(' ')}`))
        }
      })
    })
  }
  console.log('[Ether] Built dist/ether/mac-arm64/Ether.app. No app was installed or launched.')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await buildEther()
}
