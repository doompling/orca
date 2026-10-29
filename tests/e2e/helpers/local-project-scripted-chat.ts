import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { quoteStartupArg } from '../../../src/shared/tui-agent-startup-shell'

export const SCRIPTED_CHAT_RESPONSE =
  'Scripted protocol reply: the multi-root chat UI is connected.'
export const SCRIPTED_CHAT_MESSAGE = 'Send the scripted multi-root protocol reply.'

const reportSchema = z.object({
  argv: z.array(z.string()),
  cwd: z.string(),
  execPath: z.string(),
  controlRequests: z.array(
    z.object({
      request: z.object({
        subtype: z.string(),
        appendSystemPrompt: z.union([z.string(), z.array(z.string())]).optional()
      })
    })
  ),
  userMessages: z.array(
    z.object({
      type: z.literal('user'),
      uuid: z.string(),
      session_id: z.string(),
      message: z.object({ content: z.unknown() })
    })
  )
})

export function installLocalProjectScriptedChat(
  directory: string,
  response = SCRIPTED_CHAT_RESPONSE
): {
  directory: string
  scriptPath: string
  scenarioPath: string
  reportPath: string
} {
  if (process.platform === 'win32') {
    throw new Error('This scripted CLI launcher is POSIX-only')
  }
  const scriptPath = path.join(
    process.cwd(),
    'src/main/claude/__fixtures__/claude-agent-sdk-scripted-cli.mjs'
  )
  const executable = path.join(directory, 'claude')
  writeFileSync(
    executable,
    // Upstream also runs short print-mode (-p) probes through this CLI; they must not overwrite
    // the chat child's report.
    `#!/bin/sh\ncase " $* " in *" -p "*) unset ORCA_SDK_CONTRACT_REPORT_PATH ;; esac\nexec ${quoteStartupArg(process.execPath, 'posix')} ${quoteStartupArg(scriptPath, 'posix')} "$@"\n`
  )
  chmodSync(executable, 0o755)
  const scenarioPath = path.join(directory, 'scenario.json')
  const reportPath = path.join(directory, 'report.json')
  const responseId = randomUUID()
  writeFileSync(
    scenarioPath,
    JSON.stringify({
      sessionIdFromLaunch: true,
      controlResponses: {
        initialize: {
          commands: [],
          models: [{ value: 'scripted-test-model', displayName: 'Scripted test model' }]
        },
        get_settings: { settings: {}, effective: {} }
      },
      steps: [
        {
          emit: {
            type: 'system',
            subtype: 'init',
            session_id: '',
            uuid: 'scripted-init',
            model: 'scripted-test-model',
            apiKeySource: 'none'
          }
        },
        { awaitUserMessage: true },
        { replayLastUserMessage: true },
        {
          emit: {
            type: 'assistant',
            session_id: '',
            uuid: `scripted-assistant-${responseId}`,
            parent_tool_use_id: null,
            message: {
              id: `scripted-message-${responseId}`,
              type: 'message',
              role: 'assistant',
              model: 'scripted-test-model',
              content: [{ type: 'text', text: response }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 }
            }
          }
        },
        {
          emit: {
            type: 'result',
            subtype: 'success',
            is_error: false,
            session_id: '',
            uuid: 'scripted-result',
            duration_ms: 1,
            duration_api_ms: 1,
            num_turns: 1,
            result: response,
            total_cost_usd: 0,
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        },
        { delayMs: 10_000 }
      ]
    })
  )
  return { directory, scriptPath, scenarioPath, reportPath }
}

export function readLocalProjectScriptedChatReport(
  reportPath: string
): z.infer<typeof reportSchema> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(reportPath, 'utf8'))
    const parsed = reportSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function normalizeScriptedChatArguments(args: string[]): string[] {
  return args.flatMap((arg) => {
    const equal = arg.startsWith('--') ? arg.indexOf('=') : -1
    return equal === -1 ? [arg] : [arg.slice(0, equal), arg.slice(equal + 1)]
  })
}

const SessionScopeFileSchema = z.object({
  scopes: z.record(
    z.string(),
    z.object({ cwd: z.string(), roots: z.array(z.object({ path: z.string() })) })
  )
})

/** The roots Ether froze for a chat, from its scope store beside the agent-session database. */
export function readLocalWorkspaceChatRoots(
  userDataDir: string,
  sessionId: string
): { cwd: string; roots: { path: string }[] } | undefined {
  const file = path.join(userDataDir, 'ether-agent-session-scopes.json')
  return SessionScopeFileSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).scopes[sessionId]
}
