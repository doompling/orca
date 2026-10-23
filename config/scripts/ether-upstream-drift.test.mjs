import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import {
  driftVerdict,
  measureUpstreamDrift,
  MERGE_NOW_CONFLICT_THRESHOLD,
  parseMergeTreeConflicts
} from './ether-upstream-drift.mjs'

const repos = []

afterEach(() => {
  for (const repo of repos.splice(0)) {
    rmSync(repo, { recursive: true, force: true })
  }
})

async function git(repo, args) {
  const result = await runProcess({
    program: 'git',
    args: ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    cwd: repo,
    timeoutMs: 30_000
  })
  if (result.code !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout.trim()
}

async function commit(repo, files, message) {
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(repo, path), content)
  }
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', message])
}

describe('Ether upstream drift report', () => {
  it('counts commits behind and the conflicting files, grouped by manifest seam', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ether-drift-'))
    repos.push(repo)
    await git(repo, ['init', '-q', '-b', 'fork'])
    await commit(repo, { 'a.ts': 'a\n', 'b.ts': 'b\n', 'c.ts': 'c\n' }, 'base')
    await git(repo, ['branch', 'upstream'])
    await commit(repo, { 'a.ts': 'fork a\n', 'b.ts': 'fork b\n' }, 'fork')
    await git(repo, ['checkout', '-q', 'upstream'])
    await commit(repo, { 'a.ts': 'upstream a\n' }, 'upstream 1')
    await commit(repo, { 'b.ts': 'upstream b\n', 'c.ts': 'upstream c\n' }, 'upstream 2')
    await git(repo, ['checkout', '-q', 'fork'])
    const head = await git(repo, ['rev-parse', 'HEAD'])

    const drift = await measureUpstreamDrift({
      repoRoot: repo,
      upstreamRef: 'upstream',
      manifestFiles: { 'a.ts': { seam: 'editor' } },
      copiedUpstream: { 'fork-c.ts': 'c.ts', 'fork-d.ts': 'd.ts' }
    })

    expect(drift.behind).toBe(2)
    expect(drift.conflicts).toEqual(['a.ts', 'b.ts'])
    expect([...drift.conflictsBySeam]).toEqual([['editor', ['a.ts']]])
    expect(drift.changedCopiedOriginals).toEqual(['c.ts'])
    expect(await git(repo, ['rev-parse', 'HEAD'])).toBe(head)
    expect(await git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('parses merge-tree output and gives a verdict at the threshold', () => {
    expect(parseMergeTreeConflicts('0123abcd\nsrc/b.ts\nsrc/a.ts\nsrc/a.ts\n')).toEqual([
      'src/a.ts',
      'src/b.ts'
    ])
    expect(driftVerdict(MERGE_NOW_CONFLICT_THRESHOLD)).toMatch(/^fine for now/)
    expect(driftVerdict(MERGE_NOW_CONFLICT_THRESHOLD + 1)).toMatch(/^merge now/)
  })
})
