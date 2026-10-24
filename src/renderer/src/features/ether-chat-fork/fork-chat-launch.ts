import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { Tab } from '../../../../shared/tab-types'
import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { beginStructuredAgentSessionProvisionalLaunch } from '@/lib/structured-agent-session-provisional-tab'

const FORKABLE_AGENTS = new Set(['claude', 'codex'])

/** The chat tab a fork would copy, when the tab is a Claude or Codex built-in chat. */
export function forkableChatTab(unifiedTabId: string | undefined): Tab | null {
  if (!unifiedTabId || !window.api.etherChat) {
    return null
  }
  for (const tabs of Object.values(useAppStore.getState().unifiedTabsByWorktree)) {
    const tab = tabs.find((entry) => entry.id === unifiedTabId)
    if (tab) {
      return tab.contentType === 'agent-session' &&
        tab.agentSessionAgent &&
        FORKABLE_AGENTS.has(tab.agentSessionAgent)
        ? tab
        : null
    }
  }
  return null
}

function notifyForkFailure(error: unknown): void {
  toast.error(
    translate('etherChatFork.failed', 'Could not fork this chat.'),
    error instanceof Error ? { description: error.message } : undefined
  )
}

/** Copies the chat's conversation, then opens a new chat that continues the copy right after it. */
export async function forkChatTab(tab: Tab): Promise<void> {
  try {
    const fork = await window.api.etherChat.forkConversation(tab.entityId)
    const launch = beginStructuredAgentSessionProvisionalLaunch({
      plan: adoptAgentSessionLaunchVerdict({
        route: 'structured-native-chat',
        requestId: newAgentLaunchRequestId(),
        agent: fork.agent,
        worktreeId: tab.worktreeId,
        resumeFrom: { providerSessionId: fork.providerSessionId }
      }),
      hooks: {},
      afterTabId: tab.id
    })
    if (!launch) {
      notifyForkFailure(null)
      return
    }
    void launch.settlement.then((settlement) => {
      if (settlement.kind === 'failed' && !settlement.notified) {
        notifyForkFailure(settlement.error)
      }
    })
  } catch (error) {
    notifyForkFailure(error)
  }
}
