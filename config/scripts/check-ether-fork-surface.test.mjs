import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import {
  findForkSurfaceViolations,
  listTouchedUpstreamFiles,
  resolveUpstreamBase
} from './check-ether-fork-surface.mjs'

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

function write(repo, path, content) {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), content)
}

/** A repo whose `upstream` branch is the base and whose HEAD carries fork edits. */
async function fixtureRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'ether-fork-surface-'))
  repos.push(repo)
  await git(repo, ['init', '-q', '-b', 'upstream'])
  write(repo, 'src/hooked.ts', 'export const a = 1\n')
  write(repo, 'src/unmarked.ts', 'export const b = 1\n')
  write(repo, 'src/removed.ts', 'export const c = 1\n')
  write(repo, 'package.json', '{}\n')
  write(repo, 'docs/guide.md', 'upstream\n')
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-q', '-m', 'upstream'])
  await git(repo, ['checkout', '-q', '-b', 'fork'])
  write(repo, 'src/hooked.ts', 'export const a = 1\n// Ether seam: test\n')
  write(repo, 'src/unmarked.ts', 'export const b = 2\n')
  rmSync(join(repo, 'src/removed.ts'))
  write(repo, 'package.json', '{"name":"fork"}\n')
  write(repo, 'docs/guide.md', 'fork\n')
  write(repo, 'src/fork-owned.ts', 'export const d = 1\n')
  await git(repo, ['add', '-A'])
  await git(repo, ['commit', '-q', '-m', 'fork'])
  return repo
}

async function check(repo, manifest) {
  const base = await resolveUpstreamBase(repo, 'upstream')
  const touched = await listTouchedUpstreamFiles({
    repoRoot: repo,
    base,
    ignoredPrefixes: manifest.ignoredPrefixes
  })
  return {
    touched,
    violations: findForkSurfaceViolations({
      touched,
      manifest,
      readFile: (path) => readFileSync(join(repo, path), 'utf8')
    })
  }
}

const allowAll = {
  ignoredPrefixes: ['docs'],
  maxFiles: 4,
  files: {
    'src/hooked.ts': { seam: 'test' },
    'src/unmarked.ts': { seam: 'test' },
    'src/removed.ts': { seam: 'test' },
    'package.json': { seam: 'test', marker: false }
  }
}

describe('Ether fork surface check', () => {
  it('lists modified and deleted upstream files, skipping fork-owned and ignored paths', async () => {
    const { touched } = await check(await fixtureRepo(), allowAll)
    expect(touched).toEqual([
      { path: 'package.json', deleted: false },
      { path: 'src/hooked.ts', deleted: false },
      { path: 'src/removed.ts', deleted: true },
      { path: 'src/unmarked.ts', deleted: false }
    ])
  })

  it('requires a marker in every listed source file except declared non-comment files', async () => {
    const { violations } = await check(await fixtureRepo(), allowAll)
    expect(violations).toEqual([
      'src/unmarked.ts: listed upstream file has no "Ether seam:" marker'
    ])
  })

  it('fails on an unlisted file, a stale entry, and a count above the ceiling', async () => {
    const repo = await fixtureRepo()
    const { violations } = await check(repo, {
      ...allowAll,
      maxFiles: 2,
      files: {
        'src/hooked.ts': { seam: 'test' },
        'src/removed.ts': { seam: 'test' },
        'package.json': { seam: 'test', marker: false },
        'src/never-touched.ts': { seam: 'test' }
      }
    })
    expect(violations).toEqual([
      'src/unmarked.ts: modified upstream file is not listed in config/ether-fork-surface.json',
      'src/never-touched.ts: listed in config/ether-fork-surface.json but no longer differs from upstream',
      '4 upstream files are touched; the ceiling is maxFiles=2'
    ])
  })

  it('sees uncommitted edits in the working tree', async () => {
    const repo = await fixtureRepo()
    write(repo, 'src/unmarked.ts', 'export const b = 2\n// Ether seam: test\n')
    expect((await check(repo, allowAll)).violations).toEqual([])
  })
})
