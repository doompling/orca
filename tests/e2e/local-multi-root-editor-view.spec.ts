import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { createProject, createWorkspace } from './helpers/local-project-controls'

test.use({ seedTestRepo: false })

type SavedEditorView = {
  marker: string
  line: number
}

function editor(page: Page): Locator {
  return page.locator('.monaco-editor:visible').first()
}

function markerLine(page: Page, marker: string): Locator {
  return editor(page).locator('.view-line').filter({ hasText: marker })
}

async function visibleEditorView(page: Page, marker: string) {
  return markerLine(page, marker).evaluate((line, text) => {
    const monaco = line.closest('.monaco-editor')
    if (!monaco) {
      return null
    }
    const lineBounds = line.getBoundingClientRect()
    const selection = [...monaco.querySelectorAll('.selected-text')]
      .map((element) => element.getBoundingClientRect())
      .find((bounds) => bounds.width > 0 && Math.abs(bounds.top - lineBounds.top) <= 2)
    const start = line.textContent?.indexOf(text) ?? -1
    if (!selection || start < 0) {
      return null
    }
    const range = document.createRange()
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    const end = start + text.length
    let offset = 0
    let node = walker.nextNode()
    while (node) {
      const length = node.textContent?.length ?? 0
      if (offset <= start && start < offset + length) {
        range.setStart(node, start - offset)
      }
      if (offset < end && end <= offset + length) {
        range.setEnd(node, end - offset)
        break
      }
      offset += length
      node = walker.nextNode()
    }
    const markerBounds = range.getBoundingClientRect()
    const numbers = [...monaco.querySelectorAll('.line-numbers')].map((element) => ({
      number: element.textContent?.trim() ?? '',
      bounds: element.getBoundingClientRect()
    }))
    return {
      line: numbers.find(({ bounds }) => Math.abs(bounds.top - lineBounds.top) <= 2)?.number,
      selectionMatchesMarker:
        Math.abs(selection.left - markerBounds.left) <= 2 &&
        Math.abs(selection.width - markerBounds.width) <= 2
    }
  }, marker)
}

async function openPositionsFile(page: Page): Promise<void> {
  await page
    .getByRole('group', { name: 'Browse directory' })
    .getByRole('button', { name: 'app_a', exact: true })
    .click()
  await page.getByRole('radio', { name: 'Filter files by name', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find files', exact: true }).fill('positions.txt')
  await page
    .locator('[data-orca-explorer-shell] [data-file-explorer-row]')
    .filter({
      has: page.locator('[data-file-explorer-row-name]').getByText('positions.txt', { exact: true })
    })
    .dblclick()
  await expect(page.locator('.editor-header-path:visible').first()).toContainText('positions.txt')
  await expect(editor(page)).toBeVisible()
}

async function selectMarker(page: Page, marker: string, line: number): Promise<SavedEditorView> {
  const monaco = editor(page)
  await monaco.click()
  await page.keyboard.press('ControlOrMeta+f')
  const findInput = monaco.locator('.find-widget .input[aria-label="Find"]')
  await expect(findInput).toBeVisible()
  await findInput.fill(marker)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect
    .poll(() => visibleEditorView(page, marker))
    .toMatchObject({ line: String(line), selectionMatchesMarker: true })
  await expect(monaco.locator('.selected-text').first()).toBeVisible()
  await expect(markerLine(page, marker)).toBeInViewport()
  return { marker, line }
}

async function expectSavedView(page: Page, workspace: Locator, view: SavedEditorView) {
  await workspace.click()
  await expect(workspace).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.editor-header-path:visible').first()).toContainText('positions.txt')
  await expect
    .poll(() => visibleEditorView(page, view.marker))
    .toMatchObject({
      line: String(view.line),
      selectionMatchesMarker: true
    })
  await expect(editor(page).locator('.selected-text').first()).toBeVisible()
  // Find scrolls smoothly; preserve the selected line in view, not a transient animation frame.
  await expect(markerLine(page, view.marker)).toBeInViewport()
}

test('keeps separate editor selections visible when overlapping Workspaces share a file', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-local-editor-view-'))
  registerPostElectronShutdownCleanup(async () => rmSync(fixture, { recursive: true, force: true }))
  const appA = path.join(fixture, 'app_a')
  const appB = path.join(fixture, 'app_b')
  mkdirSync(appA)
  mkdirSync(appB)
  const lines = Array.from({ length: 300 }, (_, index) => `Row ${index + 1}: shared file content.`)
  lines[59] = 'MAIN_VIEW_MARKER: selection for Main.'
  lines[149] = 'INVESTIGATE_VIEW_MARKER: selection for Investigate.'
  lines[239] = 'MAINTENANCE_VIEW_MARKER: selection for Maintenance.'
  const content = `${lines.join('\n')}\n`
  const filePath = path.join(appA, 'positions.txt')
  writeFileSync(filePath, content)

  await createProject(page, 'Full application', [appA, appB])
  const fullApplication = page.getByRole('region', { name: 'Full application', exact: true })
  const main = fullApplication.locator('[data-worktree-id]').filter({ hasText: /^Main/ })
  await openPositionsFile(page)
  const mainView = await selectMarker(page, 'MAIN_VIEW_MARKER', 60)

  await createWorkspace(page, 'Full application', 'Investigate')
  const investigate = fullApplication
    .locator('[data-worktree-id]')
    .filter({ hasText: /^Investigate/ })
  await openPositionsFile(page)
  const investigateView = await selectMarker(page, 'INVESTIGATE_VIEW_MARKER', 150)

  await createProject(page, 'App A maintenance', [appA])
  const maintenance = page
    .getByRole('region', { name: 'App A maintenance', exact: true })
    .locator('[data-worktree-id]')
    .filter({ hasText: /^Main/ })
  await openPositionsFile(page)
  const maintenanceView = await selectMarker(page, 'MAINTENANCE_VIEW_MARKER', 240)

  for (const { workspace, view } of [
    { workspace: main, view: mainView },
    { workspace: investigate, view: investigateView },
    { workspace: maintenance, view: maintenanceView },
    { workspace: investigate, view: investigateView },
    { workspace: main, view: mainView }
  ]) {
    await expectSavedView(page, workspace, view)
  }
  expect(readFileSync(filePath, 'utf8')).toBe(content)
  await page.screenshot({ path: testInfo.outputPath('independent-workspace-editor-view.png') })
})
