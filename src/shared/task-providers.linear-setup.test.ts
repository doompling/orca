import { describe, expect, it } from 'vitest'
import {
  filterAvailableTaskProviders,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider
} from './task-providers'

const disconnected = { gitlabInstalled: false, linearConnected: false }

describe('Linear before connection', () => {
  it('includes Linear in the default sources before any connection exists', () => {
    expect(
      filterAvailableTaskProviders(normalizeVisibleTaskProviders(undefined), disconnected)
    ).toEqual(['github', 'linear', 'jira'])
  })

  it('keeps disconnected Linear reachable for setup', () => {
    expect(filterAvailableTaskProviders(['gitlab', 'linear'], disconnected)).toEqual(['linear'])
  })

  it('preserves a Linear default before connection', () => {
    expect(restoreAvailableDefaultTaskProvider(['github'], disconnected, 'linear')).toEqual([
      'github',
      'linear'
    ])
  })

  it('does not override an explicit choice to hide Linear', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['github', 'jira'],
        { gitlabInstalled: false, linearConnected: true },
        'github'
      )
    ).toEqual(['github', 'jira'])
  })
})
