import { GitFork } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { forkableChatTab, forkChatTab } from './fork-chat-launch'

/** "Fork Chat": a new chat that starts from a copy of this one; this chat is unchanged. */
export function ForkChatMenuItem({
  unifiedTabId
}: {
  unifiedTabId: string | undefined
}): React.JSX.Element | null {
  const tab = forkableChatTab(unifiedTabId)
  if (!tab) {
    return null
  }
  return (
    <DropdownMenuItem onSelect={() => void forkChatTab(tab)}>
      <GitFork />
      {translate('etherChatFork.menuItem', 'Fork Chat')}
    </DropdownMenuItem>
  )
}
