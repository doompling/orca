import type { AgentSessionOptionCatalog } from './agent-session-option-catalog-types'

// The running OpenCode server supplies its account-specific model catalog.
export const OPENCODE_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  models: [],
  modelApply: { midSession: { kind: 'unsupported' } }
}
