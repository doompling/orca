import {
  createOpenCodeStructuredSessionAdapter,
  type OpenCodeStructuredSessionAdapterDeps
} from '../opencode/opencode-structured-session-adapter'
import { createOpenCodeStructuredLaunchResolver } from '../opencode/opencode-structured-launch-resolution'
import type { AgentSessionRecordStore } from './agent-session-record-store'
import type { StructuredAgentSessionRuntimeDeps } from './structured-agent-session-runtime'

export function createStructuredOpenCodeRuntimeAdapter(
  deps: Pick<
    StructuredAgentSessionRuntimeDeps,
    | 'resolveWorkspacePath'
    | 'resolveLaunchEnv'
    | 'resolveOpenCodeLaunchEnv'
    | 'resolveOpenCodeCommand'
    | 'openOpenCodeConnection'
    | 'readProcessStartTime'
  > & {
    store: AgentSessionRecordStore
    bootEnvironment: Promise<NodeJS.ProcessEnv>
    onDispatchSettledLate: OpenCodeStructuredSessionAdapterDeps['onDispatchSettledLate']
    onUnexpectedExit: OpenCodeStructuredSessionAdapterDeps['onEvent']
  }
) {
  return createOpenCodeStructuredSessionAdapter({
    resolveLaunch: createOpenCodeStructuredLaunchResolver({
      store: deps.store,
      resolveWorkspacePath: deps.resolveWorkspacePath,
      resolveEnvironment: async () => ({
        ...(await deps.bootEnvironment),
        ...(await deps.resolveLaunchEnv?.()),
        ...(await deps.resolveOpenCodeLaunchEnv?.())
      }),
      ...(deps.resolveOpenCodeCommand ? { resolveCommand: deps.resolveOpenCodeCommand } : {})
    }),
    ...(deps.openOpenCodeConnection ? { openConnection: deps.openOpenCodeConnection } : {}),
    ...(deps.readProcessStartTime ? { readProcessStartTime: deps.readProcessStartTime } : {}),
    onDispatchSettledLate: deps.onDispatchSettledLate,
    onEvent: deps.onUnexpectedExit
  })
}
