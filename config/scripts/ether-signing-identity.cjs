const DEFAULT_ETHER_SIGNING_IDENTITY = 'Ether Local Code Signing'

function getEtherSigningSelector(environment) {
  const selector = (environment.ETHER_SIGN_IDENTITY ?? DEFAULT_ETHER_SIGNING_IDENTITY).trim()
  if (!selector || selector === '-' || /[\r\n\0]/.test(selector)) {
    throw new Error(
      'ETHER_SIGN_IDENTITY must name a persistent code-signing certificate, not ad-hoc signing.'
    )
  }
  return selector
}

function selectEtherSigningIdentity(output, selector) {
  const identities = [
    ...output.matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"([^"\r\n]+)"\s*$/gm)
  ].map(([, hash, name]) => ({ hash: hash.toUpperCase(), name }))
  const matches = identities.filter(
    ({ hash, name }) => name === selector || hash === selector.toUpperCase()
  )
  if (matches.length !== 1) {
    throw new Error(
      `Expected one valid signing identity for "${selector}"; found ${matches.length}. ` +
        'See docs/ether-maintenance.md for the one-time Keychain setup. No app was rebuilt.'
    )
  }
  const selected = matches[0]
  // electron-builder passes the certificate name to codesign even when selected by fingerprint.
  if (identities.filter(({ name }) => name === selected.name).length !== 1) {
    throw new Error(
      `Multiple signing identities are named "${selected.name}"; use a uniquely named certificate.`
    )
  }
  return selected
}

function requireEtherSigningHash(environment) {
  const hash = environment.ETHER_SIGN_IDENTITY
  if (
    !/^[A-F0-9]{40}$/.test(hash ?? '') ||
    environment.CSC_NAME !== hash ||
    environment.ORCA_COMPUTER_MACOS_SIGN_IDENTITY !== hash ||
    environment.CSC_IDENTITY_AUTO_DISCOVERY !== 'false' ||
    environment.CSC_LINK
  ) {
    throw new Error(
      'Use pnpm build:ether with one verified persistent signing identity for the app and helpers.'
    )
  }
  return hash
}

module.exports = {
  DEFAULT_ETHER_SIGNING_IDENTITY,
  getEtherSigningSelector,
  selectEtherSigningIdentity,
  requireEtherSigningHash
}
