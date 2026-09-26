import { test } from '@stablyai/playwright-test'
import { runPackagedAgentChatSmoke } from './helpers/packaged-agent-chat-smoke'

test('packaged Ether OpenCode chat reads both fixture roots and restores the conversation', async (// oxlint-disable-next-line no-empty-pattern -- this opt-in test owns the packaged Electron launches.
{}, testInfo) => {
  const model = process.env.ETHER_OPENCODE_TEST_MODEL?.trim()
  test.skip(
    process.env.ETHER_OPENCODE_LIVE_SMOKE !== '1' || !model,
    'Requires explicit live-smoke opt-in and ETHER_OPENCODE_TEST_MODEL'
  )
  if (model) {
    await runPackagedAgentChatSmoke({ agent: 'opencode', model, testInfo })
  }
})
