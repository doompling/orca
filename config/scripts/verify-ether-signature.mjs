import { createJiti } from 'jiti'
import product from '../../src/shared/ether-product.json' with { type: 'json' }

async function runCodesign(spec) {
  const { runProcess } = await createJiti(import.meta.url).import(
    '../../src/shared/child-process/run-process.ts'
  )
  return runProcess(spec)
}

export async function verifyEtherSignature({ appPath, identityHash, run = runCodesign }) {
  if (typeof identityHash !== 'string' || !/^[\da-f]{40}$/i.test(identityHash)) {
    throw new Error(
      'Ether signature verification requires a 40-character signing certificate hash.'
    )
  }
  if (typeof appPath !== 'string' || appPath.trim().length === 0) {
    throw new Error('Ether signature verification requires an app path.')
  }

  async function codesign(args) {
    const result = await run({
      program: '/usr/bin/codesign',
      args,
      timeoutMs: 60_000,
      maxOutputBytes: 256 * 1024
    })
    if (result.code !== 0 || result.timedOut || result.signal || result.outputTruncated) {
      throw new Error(
        `Ether signature verification failed: ${result.stderr || 'codesign did not complete successfully.'}`
      )
    }
    return `${result.stdout}\n${result.stderr}`
  }

  await codesign(['--verify', '--deep', '--strict', appPath])
  // Nested helpers have their own identifiers; apply the app identity check only to the outer app.
  await codesign([
    '--verify',
    '--strict',
    '-R',
    `=identifier "${product.appId}" and certificate leaf = H"${identityHash.toUpperCase()}"`,
    appPath
  ])
  const output = await codesign(['--display', '-r-', appPath])
  const requirement = output.match(/^designated => (.+)$/m)?.[1]?.trim()
  if (
    !requirement ||
    /\bcdhash\b/i.test(requirement) ||
    !/\b(?:certificate|anchor)\b/.test(requirement)
  ) {
    throw new Error(
      'Ether must have a stable certificate-bound designated requirement, not an ad-hoc signature.'
    )
  }
  return requirement
}
