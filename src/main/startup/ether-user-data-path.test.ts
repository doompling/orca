import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveEtherUserDataPath } from './ether-user-data-path'

describe('Ether profile selection', () => {
  const appData = resolve('test-app-data')

  it('defaults to a separate Ether directory without importing an old profile', () => {
    expect(resolveEtherUserDataPath(appData)).toBe(join(appData, 'Ether'))
  })

  it('preserves an explicit absolute isolated test profile', () => {
    const profile = resolve('test-profile', 'isolated')
    expect(resolveEtherUserDataPath(appData, profile)).toBe(profile)
  })

  it.each(['', ' ', 'relative/profile'])('refuses a non-absolute override: %s', (override) => {
    expect(() => resolveEtherUserDataPath(appData, override)).toThrow('absolute isolated')
  })

  it.each(['Orca', 'orca', 'orca-dev'])('does not write the upstream %s profile', (name) => {
    expect(() => resolveEtherUserDataPath(appData, join(appData, name))).toThrow('upstream Orca')
  })
})
