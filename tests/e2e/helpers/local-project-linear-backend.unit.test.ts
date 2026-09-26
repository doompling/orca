import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLinearSdk } from '../../../src/main/linear/linear-sdk'
import {
  installLocalProjectLinearFetch,
  LOCAL_PROJECT_LINEAR_FIXTURE
} from './local-project-linear-backend'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('scripted local Project Linear backend', () => {
  it('exercises real SDK lazy viewer, organization and issue relations without network', async () => {
    const network = vi.fn<typeof fetch>(async () => {
      throw new Error('Unexpected network')
    })
    globalThis.fetch = network
    installLocalProjectLinearFetch(undefined, LOCAL_PROJECT_LINEAR_FIXTURE)
    const client = new (loadLinearSdk().LinearClient)({ apiKey: 'lin_api_fixture_not_real' })
    const viewer = await client.viewer
    expect((await viewer.organization).id).toBe(LOCAL_PROJECT_LINEAR_FIXTURE.organization.id)
    const issue = await client.issue(LOCAL_PROJECT_LINEAR_FIXTURE.issues[0].id)
    expect(issue.identifier).toBe('ENG-101')
    expect((await issue.state)?.name).toBe('Todo')
    expect((await issue.team)?.key).toBe('ENG')
    expect((await issue.labels()).nodes).toEqual([])
    expect((await issue.children()).nodes).toEqual([])
    expect((await client.teams()).nodes[0].name).toBe('Engineering')
    expect(network).not.toHaveBeenCalled()
  })
  it('refuses all Linear mutations and unrecognized requests', async () => {
    const network = vi.fn<typeof fetch>()
    globalThis.fetch = network
    installLocalProjectLinearFetch(undefined, LOCAL_PROJECT_LINEAR_FIXTURE)
    const request = (query: string) =>
      fetch('https://api.linear.app/graphql', {
        method: 'POST',
        body: JSON.stringify({ query })
      })
    await expect(request('mutation updateIssue { issueUpdate { success } }')).rejects.toThrow(
      'refuses all provider mutations'
    )
    await expect(request('query unexpected { privateData }')).rejects.toThrow(
      'Unsupported Linear fixture query'
    )
    expect(network).not.toHaveBeenCalled()
  })
})
