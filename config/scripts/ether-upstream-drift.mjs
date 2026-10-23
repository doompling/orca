#!/usr/bin/env node
// Reports how far Ether has drifted from upstream Orca and whether to merge now.
// Writes only git objects (fetch and merge-tree), never the working tree.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runProcess } from '@orca/process-host'

export const MERGE_NOW_CONFLICT_THRESHOLD = 30

async function git(repoRoot, args, { allowedCodes = [0], timeoutMs = 120_000 } = {}) {
  const result = await runProcess({
    program: 'git',
    args,
    cwd: repoRoot,
    timeoutMs,
    maxOutputBytes: 16 * 1024 * 1024
  })
  if (result.timedOut || !allowedCodes.includes(result.code)) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result
}

/** `git merge-tree --name-only --no-messages` prints the tree, then one conflicted path per line. */
export function parseMergeTreeConflicts(stdout) {
  const [, ...paths] = stdout.split('\n')
  return [...new Set(paths.map((line) => line.trim()).filter(Boolean))].sort()
}

export function groupBySeam(conflicts, manifestFiles) {
  const bySeam = new Map()
  for (const path of conflicts) {
    const seam = manifestFiles[path]?.seam
    if (seam) {
      bySeam.set(seam, [...(bySeam.get(seam) ?? []), path])
    }
  }
  return new Map([...bySeam].sort(([left], [right]) => left.localeCompare(right)))
}

export function driftVerdict(conflictCount) {
  return conflictCount > MERGE_NOW_CONFLICT_THRESHOLD
    ? `merge now: ${conflictCount} conflicting files is past the ${MERGE_NOW_CONFLICT_THRESHOLD}-file comfort line`
    : `fine for now: ${conflictCount} conflicting files`
}

/** Upstream originals of fork-owned copies that changed since the last merge. */
async function changedCopiedOriginals(repoRoot, upstreamRef, copiedUpstream) {
  const originals = Object.values(copiedUpstream)
  if (originals.length === 0) {
    return []
  }
  const base = (await git(repoRoot, ['merge-base', 'HEAD', upstreamRef])).stdout.trim()
  const changed = await git(repoRoot, [
    'diff',
    '--name-only',
    base,
    upstreamRef,
    '--',
    ...originals
  ])
  return changed.stdout.split('\n').filter(Boolean).sort()
}

export async function measureUpstreamDrift({
  repoRoot,
  upstreamRef,
  manifestFiles,
  copiedUpstream = {}
}) {
  const behind = Number(
    (await git(repoRoot, ['rev-list', '--count', `HEAD..${upstreamRef}`])).stdout.trim()
  )
  // Exit code 1 means the merge has conflicts, which is the answer, not a failure.
  const mergeTree = await git(
    repoRoot,
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', upstreamRef],
    { allowedCodes: [0, 1] }
  )
  const conflicts = mergeTree.code === 1 ? parseMergeTreeConflicts(mergeTree.stdout) : []
  return {
    behind,
    conflicts,
    conflictsBySeam: groupBySeam(conflicts, manifestFiles),
    changedCopiedOriginals: await changedCopiedOriginals(repoRoot, upstreamRef, copiedUpstream)
  }
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, 'config/ether-fork-surface.json'), 'utf8')
  )
  const upstreamRef = manifest.upstreamRef
  if (!process.argv.includes('--no-fetch')) {
    const [remote, branch] = upstreamRef.split('/')
    await git(repoRoot, ['fetch', '--quiet', remote, branch], { timeoutMs: 600_000 })
  }
  const drift = await measureUpstreamDrift({
    repoRoot,
    upstreamRef,
    manifestFiles: manifest.files ?? {},
    copiedUpstream: manifest.copiedUpstream ?? {}
  })
  console.log(`Behind ${upstreamRef}: ${drift.behind} commits`)
  console.log(`Conflicting files: ${drift.conflicts.length}`)
  for (const [seam, paths] of drift.conflictsBySeam) {
    console.log(`  ${seam} (${paths.length}): ${paths.join(', ')}`)
  }
  for (const original of drift.changedCopiedOriginals) {
    console.log(`Upstream changed ${original}; review its fork-owned copy`)
  }
  console.log(driftVerdict(drift.conflicts.length))
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main()
}
