import { test } from '@stablyai/playwright-test'
import { runPackagedAgentChatSmoke } from './helpers/packaged-agent-chat-smoke'

test('packaged Ether Codex chat reads both fixture roots and restores the conversation', async (// oxlint-disable-next-line no-empty-pattern -- this opt-in test owns the packaged Electron launches.
{}, testInfo) => {
  const model = process.env.ETHER_CODEX_TEST_MODEL?.trim()
  test.skip(
    process.env.ETHER_CODEX_LIVE_SMOKE !== '1' || !model,
    'Requires explicit live-smoke opt-in and ETHER_CODEX_TEST_MODEL'
  )
  if (model) {
    await runPackagedAgentChatSmoke({ agent: 'codex', model, testInfo })
  }
})
