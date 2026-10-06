import { describe, expect, it } from 'vitest'
import signing from './ether-signing-identity.cjs'

const fingerprint = 'A'.repeat(40)
const otherFingerprint = 'B'.repeat(40)
const name = signing.DEFAULT_ETHER_SIGNING_IDENTITY
const inventory = `  1) ${fingerprint} "${name}"\n     1 valid identities found\n`

describe('Ether signing identity', () => {
  it('selects an exact name or fingerprint, never an unrelated or substring match', () => {
    expect(signing.selectEtherSigningIdentity(inventory, name)).toEqual({ name, hash: fingerprint })
    expect(signing.selectEtherSigningIdentity(inventory, fingerprint.toLowerCase()).hash).toBe(
      fingerprint
    )
    expect(() => signing.selectEtherSigningIdentity(inventory, 'Ether')).toThrow('found 0')
    expect(() => signing.selectEtherSigningIdentity(inventory, otherFingerprint)).toThrow('found 0')
  })

  it('fails with setup instructions when no usable identity exists', () => {
    expect(() => signing.selectEtherSigningIdentity('0 valid identities found', name)).toThrow(
      'docs/ether-maintenance.md'
    )
    expect(() =>
      signing.selectEtherSigningIdentity(
        `1) ${fingerprint} "${name}" (CSSMERR_TP_CERT_EXPIRED)`,
        name
      )
    ).toThrow('found 0')
  })

  it('rejects duplicate names even when selected by fingerprint', () => {
    const duplicate = `${inventory} 2) ${otherFingerprint} "${name}"\n`
    expect(() => signing.selectEtherSigningIdentity(duplicate, name)).toThrow('found 2')
    expect(() => signing.selectEtherSigningIdentity(duplicate, fingerprint)).toThrow(
      'uniquely named'
    )
  })

  const environment = {
    ETHER_SIGN_IDENTITY: fingerprint,
    CSC_NAME: fingerprint,
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY: fingerprint,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }

  it('requires the same verified fingerprint for every signer', () => {
    expect(signing.requireEtherSigningHash(environment)).toBe(fingerprint)
  })

  it.each([
    ['ETHER_SIGN_IDENTITY', undefined],
    ['ETHER_SIGN_IDENTITY', '-'],
    ['ETHER_SIGN_IDENTITY', name],
    ['CSC_NAME', otherFingerprint],
    ['ORCA_COMPUTER_MACOS_SIGN_IDENTITY', '-'],
    ['CSC_IDENTITY_AUTO_DISCOVERY', 'true'],
    ['CSC_LINK', '/private/certificate.p12']
  ])('rejects a signing bypass via %s=%s', (key, value) => {
    expect(() => signing.requireEtherSigningHash({ ...environment, [key]: value })).toThrow(
      'persistent'
    )
  })
})
