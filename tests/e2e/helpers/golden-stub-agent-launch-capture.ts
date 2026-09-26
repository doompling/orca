import { z } from 'zod'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { stripAnsiEscapeSequences } from '../../../src/shared/ansi-escape-sequences'
import { quoteStartupArg } from '../../../src/shared/tui-agent-startup-shell'

const launchCaptureSchema = z.object({ cwd: z.string(), argv: z.array(z.string()) }).strict()
export type GoldenStubAgentLaunchCapture = z.infer<typeof launchCaptureSchema>

export function goldenStubAgentCommand(
  agent: 'codex' | 'claude',
  platform = process.platform
): string {
  const directory = realpathSync('tests/e2e/fixtures/golden-stub-agent')
  const filename = platform === 'win32' ? `${agent}.cmd` : agent
  const executable = realpathSync(path.join(directory, filename))
  if (path.dirname(executable) !== directory || path.basename(executable) !== filename) {
    throw new Error('The fake agent executable escaped its fixture directory.')
  }
  return quoteStartupArg(executable, platform === 'win32' ? 'cmd' : 'posix')
}

export function readGoldenStubAgentLaunchCapture(
  terminalContent: string
): GoldenStubAgentLaunchCapture | null {
  const text = stripAnsiEscapeSequences(terminalContent)
  const begin = 'GOLDEN_STUB_LAUNCH_BEGIN'
  const end = 'GOLDEN_STUB_LAUNCH_END'
  const start = text.lastIndexOf(begin)
  const finish = start === -1 ? -1 : text.indexOf(end, start + begin.length)
  if (finish === -1) {
    return null
  }
  try {
    const raw: unknown = JSON.parse(text.slice(start + begin.length, finish).replace(/[\r\n]/g, ''))
    const parsed = launchCaptureSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
