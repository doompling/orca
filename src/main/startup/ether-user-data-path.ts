import { isAbsolute, join, resolve } from 'node:path'

export function resolveEtherUserDataPath(appData: string, override?: string): string {
  if (override !== undefined && (!override.trim() || !isAbsolute(override))) {
    throw new Error('Ether requires an absolute isolated ORCA_DEV_USER_DATA_PATH.')
  }
  const target = resolve(override ?? join(appData, 'Ether'))
  const upstreamPaths = ['Orca', 'orca', 'orca-dev'].map((name) =>
    resolve(appData, name).toLowerCase()
  )
  if (upstreamPaths.includes(target.toLowerCase())) {
    throw new Error('Ether cannot use the upstream Orca profile. Choose an isolated directory.')
  }
  return target
}
