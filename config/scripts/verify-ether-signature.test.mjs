import { describe, expect, it, vi } from 'vitest'
import { verifyEtherSignature } from './verify-ether-signature.mjs'

const appPath = '/build output/Ether.app'
const identityHash = '1234567890abcdef1234567890abcdef12345678'
const requirement = `identifier "com.joelkorpela.ether" and anchor H"${identityHash}"`
const success = { code: 0, signal: null, timedOut: false, stdout: '', stderr: '' }

function createRun(
  display = `Executable=${appPath}/Contents/MacOS/Ether\ndesignated => ${requirement}\n`
) {
  return vi
    .fn()
    .mockResolvedValueOnce(success)
    .mockResolvedValueOnce(success)
    .mockResolvedValueOnce({ ...success, stderr: display })
}

describe('Ether packaged signature verification', () => {
  it('verifies nested seals, checks only the outer app identity, and returns its stable requirement', async () => {
    const run = createRun()
    await expect(verifyEtherSignature({ appPath, identityHash, run })).resolves.toBe(requirement)
    expect(run.mock.calls.map(([spec]) => spec.args)).toEqual([
      ['--verify', '--deep', '--strict', appPath],
      [
        '--verify',
        '--strict',
        '-R',
        `=identifier "com.joelkorpela.ether" and certificate leaf = H"${identityHash.toUpperCase()}"`,
        appPath
      ],
      ['--display', '-r-', appPath]
    ])
    for (const [spec] of run.mock.calls) {
      expect(spec).toMatchObject({
        program: '/usr/bin/codesign',
        timeoutMs: 60_000,
        maxOutputBytes: 256 * 1024
      })
    }
  })

  it.each([undefined, '', '-', 'a'.repeat(39), 'g'.repeat(40), `${identityHash} `])(
    'rejects invalid identity %s without starting a process',
    async (invalidHash) => {
      const run = createRun()
      await expect(
        verifyEtherSignature({ appPath, identityHash: invalidHash, run })
      ).rejects.toThrow('40-character signing certificate hash')
      expect(run).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, '', '   '])('rejects an absent app path %s', async (invalidPath) => {
    const run = createRun()
    await expect(verifyEtherSignature({ appPath: invalidPath, identityHash, run })).rejects.toThrow(
      'requires an app path'
    )
    expect(run).not.toHaveBeenCalled()
  })

  it.each([0, 1, 2])('stops when codesign verification step %s fails', async (step) => {
    const run = vi.fn()
    for (let index = 0; index < step; index += 1) {
      run.mockResolvedValueOnce(success)
    }
    run.mockResolvedValueOnce({ ...success, code: 1, stderr: 'signature rejected' })
    await expect(verifyEtherSignature({ appPath, identityHash, run })).rejects.toThrow(
      'signature rejected'
    )
    expect(run).toHaveBeenCalledTimes(step + 1)
  })

  it.each([{ timedOut: true }, { signal: 'SIGTERM' }, { outputTruncated: true }, { code: null }])(
    'refuses incomplete verification %j',
    async (incomplete) => {
      const run = vi.fn().mockResolvedValue({ ...success, ...incomplete })
      await expect(verifyEtherSignature({ appPath, identityHash, run })).rejects.toThrow(
        'signature verification failed'
      )
    }
  )

  it.each([
    '',
    'designated => identifier "com.joelkorpela.ether"',
    `designated => cdhash H"${identityHash}"`,
    `designated => ${requirement} or cdhash H"${identityHash}"`
  ])('rejects missing or unstable designated requirements: %s', async (display) => {
    await expect(
      verifyEtherSignature({ appPath, identityHash, run: createRun(display) })
    ).rejects.toThrow('stable certificate-bound designated requirement')
  })

  it('also accepts certificate-based requirements and stdout display output', async () => {
    const certificateRequirement = `identifier "com.joelkorpela.ether" and certificate leaf = H"${identityHash}"`
    const run = vi
      .fn()
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce({ ...success, stdout: `designated => ${certificateRequirement}\n` })
    await expect(verifyEtherSignature({ appPath, identityHash, run })).resolves.toBe(
      certificateRequirement
    )
  })
})
