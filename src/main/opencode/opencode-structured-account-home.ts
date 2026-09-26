import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import type { AgentSessionAccountHome } from '../../shared/agent-session-record'
import { resolveOpenCodeConfigDirectory } from '../../shared/opencode-config-directory'
import { resolveOpenCodeDataDirectory } from './opencode-data-directory'

export type OpenCodeAccountHome = Extract<AgentSessionAccountHome, { variable: 'XDG_DATA_HOME' }>

export function captureOpenCodeAccountHome(
  environment: NodeJS.ProcessEnv,
  cwd: string,
  home = homedir()
): OpenCodeAccountHome {
  return {
    variable: 'XDG_DATA_HOME',
    path: resolve(cwd, dirname(resolveOpenCodeDataDirectory(environment, home))),
    configHome: resolve(cwd, dirname(resolveOpenCodeConfigDirectory(environment, home))),
    ...(environment.OPENCODE_CONFIG?.trim()
      ? { configFile: resolve(cwd, environment.OPENCODE_CONFIG.trim()) }
      : {}),
    ...(environment.OPENCODE_CONFIG_DIR?.trim()
      ? { configDir: resolve(cwd, environment.OPENCODE_CONFIG_DIR.trim()) }
      : {})
  }
}

export function pinnedOpenCodeEnvironment(
  accountHome: OpenCodeAccountHome,
  environment: NodeJS.ProcessEnv
): { env: Record<string, string>; envToDelete: string[] } {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === 'string') {
      env[key] = value
    }
  }
  env.XDG_DATA_HOME = accountHome.path
  if (accountHome.configHome) {
    env.XDG_CONFIG_HOME = accountHome.configHome
  }
  const envToDelete: string[] = []
  for (const [key, value] of [
    ['OPENCODE_CONFIG', accountHome.configFile],
    ['OPENCODE_CONFIG_DIR', accountHome.configDir]
  ] as const) {
    if (value) {
      env[key] = value
    } else {
      delete env[key]
      envToDelete.push(key)
    }
  }
  return { env, envToDelete }
}
