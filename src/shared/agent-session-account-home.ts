import { isRuntimePathAbsolute } from './cross-platform-path'

export type AgentSessionAccountHome =
  | { variable: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME'; path: string }
  | {
      variable: 'XDG_DATA_HOME'
      path: string
      configHome?: string
      configFile?: string
      configDir?: string
    }

function boundedPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

function absolutePath(value: unknown): value is string {
  return boundedPath(value) && !value.includes('\0') && isRuntimePathAbsolute(value)
}

export function isAgentSessionAccountHome(value: unknown): value is AgentSessionAccountHome {
  if (!value || typeof value !== 'object' || !('variable' in value) || !('path' in value)) {
    return false
  }
  if (value.variable === 'CLAUDE_CONFIG_DIR' || value.variable === 'CODEX_HOME') {
    return boundedPath(value.path)
  }
  if (value.variable !== 'XDG_DATA_HOME' || !absolutePath(value.path)) {
    return false
  }
  return ['configHome', 'configFile', 'configDir'].every((key) => {
    const supplied = Reflect.get(value, key)
    return supplied === undefined || absolutePath(supplied)
  })
}

export function agentSessionAccountHomesEqual(
  left: AgentSessionAccountHome,
  right: AgentSessionAccountHome
): boolean {
  if (left.variable !== right.variable || left.path !== right.path) {
    return false
  }
  return (
    left.variable !== 'XDG_DATA_HOME' ||
    (right.variable === 'XDG_DATA_HOME' &&
      left.configHome === right.configHome &&
      left.configFile === right.configFile &&
      left.configDir === right.configDir)
  )
}
