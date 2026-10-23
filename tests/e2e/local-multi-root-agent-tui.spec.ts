import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { createProject } from './helpers/local-project-controls'
import {
  getGoldenStubAgentLaunchEnv,
  GOLDEN_STUB_AGENTS,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { getTerminalContent, waitForActivePanePtyId } from './helpers/terminal'
import {
  goldenStubAgentCommand,
  readGoldenStubAgentLaunchCapture,
  type GoldenStubAgentLaunchCapture
} from './helpers/golden-stub-agent-launch-capture'

test.use({ seedTestRepo: false, launchEnv: getGoldenStubAgentLaunchEnv() })

test.afterEach(async ({ orcaPage: page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await testInfo.attach('active-terminal-output.txt', {
      body: await getTerminalContent(page, 24_000),
      contentType: 'text/plain'
    })
  }
})

async function readLaunch(page: Page): Promise<GoldenStubAgentLaunchCapture> {
  let capture: GoldenStubAgentLaunchCapture | null = null
  await expect
    .poll(
      async () => {
        capture = readGoldenStubAgentLaunchCapture(await getTerminalContent(page, 24_000))
        return capture !== null
      },
      { timeout: 20_000 }
    )
    .toBe(true)
  if (!capture) {
    throw new Error('The fake agent did not display its launch arguments.')
  }
  return capture
}

function verifyLaunch(
  capture: GoldenStubAgentLaunchCapture,
  agent: 'codex' | 'claude',
  workspaceKey: string | null,
  directories: string[]
): string {
  expect(workspaceKey).toMatch(/^folder:/)
  if (!workspaceKey) {
    throw new Error('Missing Workspace identity')
  }
  const paths = directories.map((directory) => realpathSync(directory))
  expect(capture.cwd).toBe(paths[0])
  const addedDirectories = capture.argv.flatMap((arg, index) =>
    arg === '--add-dir' ? [capture.argv[index + 1]] : []
  )
  expect(addedDirectories).toEqual(paths)
  expect(capture.argv).not.toContain('--dangerously-bypass-approvals-and-sandbox')
  expect(capture.argv).not.toContain('--dangerously-skip-permissions')
  const prompts = capture.argv.filter((arg) =>
    arg.startsWith('Workspace context supplied by Orca.')
  )
  expect(prompts).toHaveLength(1)
  const prompt = prompts[0]
  if (!prompt) {
    throw new Error('Missing Workspace initialization prompt')
  }
  expect(prompt).toContain(`"workspaceId": ${JSON.stringify(workspaceKey.slice('folder:'.length))}`)
  for (const [index, directory] of directories.entries()) {
    expect(prompt).toContain(`"label": ${JSON.stringify(path.basename(directory))}`)
    expect(prompt).toContain(`"path": ${JSON.stringify(paths[index])}`)
  }
  if (agent === 'codex') {
    expect(capture.argv[capture.argv.indexOf('--cd') + 1]).toBe(paths[0])
  } else {
    expect(capture.argv[capture.argv.indexOf(prompt) - 1]).toBe('--')
  }
  return prompt
}

for (const { id, menuItemName } of GOLDEN_STUB_AGENTS) {
  test(`${id} terminal receives complete local Workspace roots and isolates App A-only context with pinned stubs`, async ({
    orcaPage: page,
    registerPostElectronShutdownCleanup
  }, testInfo) => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-agent-scope-'))
    const appA = path.join(fixture, 'app_a')
    const appB = path.join(fixture, 'app_b')
    for (const directory of [appA, appB]) {
      mkdirSync(directory)
      writeFileSync(path.join(directory, 'marker.txt'), `${path.basename(directory)}\n`)
    }
    registerPostElectronShutdownCleanup(async () =>
      rmSync(fixture, { recursive: true, force: true })
    )
    // Pin test-only executables: login shells can reorder PATH ahead of its fixture entries.
    await page.evaluate(
      async ({ codex, claude, windows }) => {
        const store = window.__store
        if (!store) {
          throw new Error('Orca store is unavailable')
        }
        await store.getState().updateSettings({
          agentCmdOverrides: { codex, claude },
          agentDefaultArgs: { codex: '--golden-capture-launch', claude: '--golden-capture-launch' },
          experimentalNativeChat: false,
          ...(windows ? { terminalWindowsShell: 'cmd.exe' } : {})
        })
      },
      {
        codex: goldenStubAgentCommand('codex'),
        claude: goldenStubAgentCommand('claude'),
        windows: process.platform === 'win32'
      }
    )

    await createProject(page, 'Full application', [appA, appB])
    const fullMain = page
      .getByRole('region', { name: 'Full application', exact: true })
      .locator('[data-worktree-id]')
      .filter({ hasText: /^Main/ })
    const fullKey = await fullMain.getAttribute('data-worktree-id')
    await launchGoldenStubAgentFromNewTab(page, menuItemName)
    const firstPty = await waitForActivePanePtyId(page)
    verifyLaunch(await readLaunch(page), id, fullKey, [appA, appB])
    await page.screenshot({ path: testInfo.outputPath(`${id}-two-root-stub-launch.png`) })

    await createProject(page, 'App A maintenance', [appA])
    const maintenance = page
      .getByRole('region', { name: 'App A maintenance', exact: true })
      .locator('[data-worktree-id]')
      .filter({ hasText: /^Main/ })
    const maintenanceKey = await maintenance.getAttribute('data-worktree-id')
    expect(maintenanceKey).not.toBe(fullKey)
    await launchGoldenStubAgentFromNewTab(page, menuItemName)
    expect(await waitForActivePanePtyId(page)).not.toBe(firstPty)
    const capture = await readLaunch(page)
    const prompt = verifyLaunch(capture, id, maintenanceKey, [appA])
    expect(capture.argv).not.toContain(realpathSync(appB))
    expect(prompt).not.toContain(JSON.stringify(realpathSync(appB)))
    expect(prompt).not.toContain('app_b')
    await page.screenshot({ path: testInfo.outputPath(`${id}-app-a-only-stub-launch.png`) })
  })
}
