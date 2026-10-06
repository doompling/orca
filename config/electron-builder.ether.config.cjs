const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const base = require('./electron-builder.config.cjs')
const product = require('../src/shared/ether-product.json')
const {
  DEFAULT_ETHER_SIGNING_IDENTITY,
  requireEtherSigningHash
} = require('./scripts/ether-signing-identity.cjs')

const releaseFlags = ['ORCA_MAC_RELEASE', 'ORCA_MAC_HOURLY', 'ORCA_MAC_DAILY', 'ORCA_MAC_ADHOC']
if (releaseFlags.some((key) => process.env[key] === '1')) {
  throw new Error('Ether local builds cannot use upstream release channels or signing.')
}

module.exports = {
  ...base,
  appId: product.appId,
  productName: product.name,
  protocols: [],
  publish: null,
  forceCodeSigning: true,
  directories: { ...base.directories, output: 'dist/ether' },
  extraMetadata: {
    ...base.extraMetadata,
    name: product.packageName,
    productName: product.name,
    etherBuild: product
  },
  files: [
    'out/{main,preload,renderer,cli,shared,relay}/**/*',
    'out/package.json',
    'resources/**/*',
    'package.json',
    'LICENSE',
    ...base.files,
    '!.orca-local-profile{,/**/*}',
    '!dist{,/**/*}'
  ],
  mac: {
    ...base.mac,
    identity: process.env.ETHER_SIGN_IDENTITY || DEFAULT_ETHER_SIGNING_IDENTITY,
    timestamp: 'none',
    hardenedRuntime: false,
    notarize: false,
    artifactName: 'ether-macos-${arch}.${ext}',
    target: [{ target: 'dir', arch: ['arm64'] }],
    extendInfo: {
      ...Object.fromEntries(
        Object.entries(base.mac.extendInfo).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.replaceAll('Orca', product.name) : value
        ])
      ),
      CFBundleName: product.name,
      CFBundleDisplayName: product.name
    }
  },
  dmg: { ...base.dmg, artifactName: 'ether-macos-${arch}.${ext}' },
  beforePack: (context, ...args) => {
    if (context.electronPlatformName !== 'darwin' || context.arch !== 3) {
      throw new Error('This Ether build supports only local macOS arm64 packaging.')
    }
    requireEtherSigningHash(process.env)
    return base.beforePack(context, ...args)
  },
  afterPack: async (context) => {
    await base.afterPack(context)
    const resources = join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources'
    )
    const launcherPath = join(resources, 'bin', 'orca')
    const launcher = readFileSync(launcherPath, 'utf8')
    const upstreamExecutable = 'ELECTRON="$CONTENTS/MacOS/Orca"'
    if (launcher.split(upstreamExecutable).length !== 2) {
      throw new Error('The packaged CLI launcher changed; refusing an unverified Ether launcher.')
    }
    writeFileSync(
      launcherPath,
      launcher.replace(
        upstreamExecutable,
        'ELECTRON="$CONTENTS/MacOS/Ether"\n' +
          'export ORCA_USER_DATA_PATH="${ORCA_USER_DATA_PATH:-${HOME}/Library/Application Support/Ether}"'
      )
    )
    const compatibilityPath = join(resources, 'orca-local-build.json')
    const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'))
    writeFileSync(
      compatibilityPath,
      `${JSON.stringify({ ...compatibility, appId: product.appId }, null, 2)}\n`
    )
  }
}
