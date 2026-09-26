import type {
  AgentJournalItemIdentity,
  AgentSessionJournalIdentity
} from '../../shared/agent-session-journal-types'
import type {
  StructuredAgentSessionAcquireInput,
  StructuredAgentSessionLifecycleEvent
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type {
  OpenCodeServerConnection,
  OpenCodeServerConnectionHandlers,
  OpenCodeServerLaunch
} from './opencode-server-connection-types'
import type { OpenCodeStructuredLaunch } from './opencode-structured-launch-resolution'
import type { OpenCodeJournalTranslator } from './opencode-journal-translation'
import type { OpenCodeModel } from './opencode-session-options'

export type OpenCodeStructuredSessionAdapterDeps = {
  resolveLaunch: (input: {
    identity: AgentSessionJournalIdentity
  }) => Promise<OpenCodeStructuredLaunch>
  openConnection?: (
    launch: OpenCodeServerLaunch,
    handlers: OpenCodeServerConnectionHandlers
  ) => Promise<OpenCodeServerConnection>
  readProcessStartTime?: (pid: number) => Promise<number | null>
  now?: () => number
  onEvent?: (event: StructuredAgentSessionLifecycleEvent) => void
  onDispatchSettledLate?: (event: {
    sessionId: string
    clientMessageId: string
    providerIdentity: AgentJournalItemIdentity
  }) => void
}
export type OpenCodeSessionOwner = {
  input: StructuredAgentSessionAcquireInput
  generation: string
  connection: OpenCodeServerConnection | null
  launch: OpenCodeStructuredLaunch | null
  providerSessionId: string | null
  translator: OpenCodeJournalTranslator | null
  models: OpenCodeModel[]
  model: OpenCodeModel | null
  published: boolean
  requestedClose: boolean
  failed: boolean
  notified: boolean
  ready: Promise<void>
  releaseReady: () => void
  unbind?: () => void
  events: unknown[]
  eventBytes: number
  submissions: Map<
    string,
    { clientMessageId: string; bodyFingerprint: string; state: 'sending' | 'accepted' | 'unknown' }
  >
  dispatching: boolean
  cancelling: boolean
}

export function assertOpenCodeOwner(owner: OpenCodeSessionOwner, fence?: number): void {
  if (
    owner.requestedClose ||
    owner.failed ||
    owner.connection?.closed ||
    (fence !== undefined && owner.input.fence !== fence)
  ) {
    throw new Error('OpenCode session is no longer the current provider owner.')
  }
}
