import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const RELEASES_DIRECTORY = 'dist/ether-releases'
const LEGACY_BUNDLE = 'dist/ether/mac-arm64/Ether.app'

/** Most recently built `pnpm build:ether` release, else the pre-versioning location. */
export function defaultEtherReleaseBundle(): string {
  const bundles = existsSync(RELEASES_DIRECTORY)
    ? readdirSync(RELEASES_DIRECTORY)
        .map((name) => path.join(RELEASES_DIRECTORY, name, 'Ether.app'))
        .filter((bundle) => existsSync(bundle))
    : []
  // Why mtime, not name: same-day releases differ only by commit hash, which doesn't sort by time.
  bundles.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
  return bundles.at(-1) ?? LEGACY_BUNDLE
}
