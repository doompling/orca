#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runProcess, spawnProcess } from '@orca/process-host'
import product from '../../src/shared/ether-product.json' with { type: 'json' }
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'
import signing from './ether-signing-identity.cjs'
import { verifyEtherSignature } from './verify-ether-signature.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const bundleId = product.appId
// Why scratch + move: each release keeps its own bundle, so a build never replaces an app (or the
// terminal daemon it hosts) that is running.
const BUILD_DIRECTORY = 'dist/ether-build'
const RELEASES_DIRECTORY = 'dist/ether-releases'

export const RELEASES_README = `# Ether releases

Each folder holds one \`Ether.app\`, named \`<build date>-<commit>\`. \`pnpm build:ether\` adds a
folder and a row here; it never replaces an existing release.

Releases share the profile in \`~/Library/Application Support/Ether\`, so only one runs on it at a
time: quit Ether, then open another release. To try a release next to the one you use, give it its
own profile (it starts empty; see docs/ether-maintenance.md):

    open -n --env ORCA_DEV_USER_DATA_PATH="$HOME/Library/Application Support/Ether-try" dist/ether-releases/<release>/Ether.app

Releases before \`2026-10-23-ae81434245\` can't read the Projects list once a Workspace mark is
set; clear all marks (⌘; then Backspace on each) before going back to one of them.

The first release built on upstream Orca's SQLite profile (after \`2026-10-23-ae81434245\`)
upgrades the profile in place, one way. Older releases can't open an upgraded profile: back up
the whole profile folder first, and restore that backup to go back (docs/ether-maintenance.md).

| Release | Version | Commit |
|---|---|---|
`

/** `<local date>-<10-char commit>`, suffixed when that folder already exists. */
export function nextEtherReleaseId({ commit, date = new Date(), exists }) {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')
  const base = `${day}-${commit.slice(0, 10)}`
  let id = base
  for (let attempt = 2; exists(id); attempt++) {
    id = `${base}-${attempt}`
  }
  return id
}

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
  const signingIdentity = signing.getEtherSigningSelector(environment)
  const outputDirectory = BUILD_DIRECTORY
  const env = {
    ...environment,
    ORCA_SKIP_DEV_CLI_INSTALL: '1',
    ORCA_COMPUTER_MACOS_BUNDLE_ID: `${bundleId}.computer-use`,
    ETHER_SIGN_IDENTITY: signingIdentity,
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: signingIdentity,
    CSC_NAME: signingIdentity,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }
  delete env.CSC_LINK
  delete env.CSC_KEY_PASSWORD
  return {
    env,
    outputDirectory,
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
        'never',
        `--config.directories.output=${outputDirectory}`
      ]
    ]
  }
}

async function buildEther() {
  const plan = createEtherBuildPlan()
  process.chdir(repoRoot)
  const identities = await runProcess({
    program: '/usr/bin/security',
    args: ['find-identity', '-v', '-p', 'codesigning'],
    timeoutMs: 15_000
  })
  if (
    identities.code !== 0 ||
    identities.timedOut ||
    identities.signal ||
    identities.outputTruncated
  ) {
    throw new Error(
      'Cannot read available signing identities. Unlock your login keychain and retry.'
    )
  }
  const signer = signing.selectEtherSigningIdentity(identities.stdout, plan.env.ETHER_SIGN_IDENTITY)
  plan.env.ETHER_SIGN_IDENTITY = signer.hash
  plan.env.CSC_NAME = signer.hash
  plan.env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY = signer.hash
  console.log(`[Ether] Signing with ${signer.name} (${signer.hash})`)
  const identity = getLocalBuildIdentity()
  plan.env.ORCA_LOCAL_BUILD_VERSION = identity.version
  plan.env.ORCA_BUILD_COMMIT = identity.commit
  const { command, prefixArgs } = resolvePnpmCliInvocation()
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
  const releasesRoot = resolve(repoRoot, RELEASES_DIRECTORY)
  const releaseId = nextEtherReleaseId({
    commit: identity.commit,
    exists: (id) => existsSync(join(releasesRoot, id))
  })
  const releaseDirectory = join(releasesRoot, releaseId)
  mkdirSync(releaseDirectory, { recursive: true })
  const appPath = join(releaseDirectory, 'Ether.app')
  renameSync(resolve(repoRoot, plan.outputDirectory, 'mac-arm64', 'Ether.app'), appPath)
  const requirement = await verifyEtherSignature({ appPath, identityHash: signer.hash })
  console.log(`[Ether] Verified signing identity: ${requirement}`)
  const subject = await runProcess({
    program: 'git',
    args: ['log', '-1', '--format=%s'],
    cwd: repoRoot,
    timeoutMs: 15_000
  })
  recordEtherRelease(releasesRoot, releaseId, identity, subject.stdout.trim())
  console.log(`[Ether] Built release ${releaseId}: ${appPath}`)
  console.log('[Ether] No app was installed, replaced, or launched.')
}

export function etherReleaseRow(releaseId, identity, subject) {
  const safeSubject = subject.replaceAll('|', '\\|')
  return `| \`${releaseId}\` | \`${identity.version}\` | ${identity.commit.slice(0, 10)} ${safeSubject} |\n`
}

function recordEtherRelease(releasesRoot, releaseId, identity, subject) {
  const readme = join(releasesRoot, 'README.md')
  if (!existsSync(readme)) {
    writeFileSync(readme, RELEASES_README)
  }
  appendFileSync(readme, etherReleaseRow(releaseId, identity, subject))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await buildEther()
}
