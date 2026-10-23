#!/usr/bin/env node
// Fails when the fork touches an upstream file the manifest does not allow, or a touched source file
// carries no `Ether seam:` marker, or the count of touched upstream files grows past its ceiling.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runProcess } from '@orca/process-host'

const SEAM_MARKER = 'Ether seam:'
const MANIFEST_PATH = 'config/ether-fork-surface.json'

async function git(repoRoot, args) {
  const result = await runProcess({
    program: 'git',
    args,
    cwd: repoRoot,
    timeoutMs: 60_000,
    maxOutputBytes: 16 * 1024 * 1024
  })
  if (result.code !== 0 || result.timedOut) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout
}

function isIgnored(path, ignoredPrefixes) {
  return ignoredPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Upstream-owned files that differ from `base` in the working tree: modified or deleted. */
export async function listTouchedUpstreamFiles({ repoRoot, base, ignoredPrefixes = [] }) {
  const output = await git(repoRoot, [
    'diff',
    '--name-status',
    '--no-renames',
    '--diff-filter=MD',
    base,
    '--'
  ])
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t')
      return { path, deleted: status === 'D' }
    })
    .filter(({ path }) => !isIgnored(path, ignoredPrefixes))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export async function resolveUpstreamBase(repoRoot, upstreamRef) {
  return (await git(repoRoot, ['merge-base', 'HEAD', upstreamRef])).trim()
}

/** Every rule violation as a sentence; empty when the surface matches the manifest. */
export function findForkSurfaceViolations({ touched, manifest, readFile }) {
  const violations = []
  const allowed = manifest.files ?? {}
  const touchedPaths = new Set(touched.map(({ path }) => path))
  for (const { path, deleted } of touched) {
    const entry = allowed[path]
    if (!entry) {
      violations.push(`${path}: modified upstream file is not listed in ${MANIFEST_PATH}`)
      continue
    }
    if (!deleted && entry.marker !== false && !readFile(path).includes(SEAM_MARKER)) {
      violations.push(`${path}: listed upstream file has no "${SEAM_MARKER}" marker`)
    }
  }
  for (const path of Object.keys(allowed)) {
    if (!touchedPaths.has(path)) {
      violations.push(`${path}: listed in ${MANIFEST_PATH} but no longer differs from upstream`)
    }
  }
  if (touched.length > manifest.maxFiles) {
    violations.push(
      `${touched.length} upstream files are touched; the ceiling is maxFiles=${manifest.maxFiles}`
    )
  }
  return violations
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const manifest = JSON.parse(readFileSync(join(repoRoot, MANIFEST_PATH), 'utf8'))
  const base =
    process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) ??
    (await resolveUpstreamBase(repoRoot, manifest.upstreamRef))
  const touched = await listTouchedUpstreamFiles({
    repoRoot,
    base,
    ignoredPrefixes: manifest.ignoredPrefixes
  })
  const violations = findForkSurfaceViolations({
    touched,
    manifest,
    readFile: (path) => readFileSync(join(repoRoot, path), 'utf8')
  })
  if (violations.length > 0) {
    console.error(`Ether fork surface check failed against ${base.slice(0, 10)}:`)
    for (const violation of violations) {
      console.error(`  - ${violation}`)
    }
    process.exitCode = 1
    return
  }
  console.log(
    `Ether fork surface: ${touched.length}/${manifest.maxFiles} upstream files touched (base ${base.slice(0, 10)}).`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
