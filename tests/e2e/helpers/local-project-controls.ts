import path from 'node:path'
import { expect, type Page } from '@stablyai/playwright-test'

export async function createProject(
  page: Page,
  name: string,
  directories: string[]
): Promise<void> {
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.getByLabel('Project name').fill(name)
  for (const directory of directories) {
    await dialog.getByLabel('Directory path').fill(directory)
    await dialog.getByRole('button', { name: 'Add directory', exact: true }).click()
  }
  await expect(dialog.getByLabel('Default command directory')).toContainText(
    path.basename(directories[0])
  )
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
}

export async function createWorkspace(page: Page, project: string, name: string): Promise<void> {
  await page.getByRole('button', { name: `New Workspace in ${project}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New Workspace', exact: true })
  await dialog.getByLabel('Workspace name').fill(name)
  await dialog.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

export async function openRootReadme(page: Page, root: string): Promise<void> {
  await page
    .getByRole('group', { name: 'Browse directory' })
    .getByRole('button', { name: root, exact: true })
    .click()
  await page.getByRole('radio', { name: 'Filter files by name', exact: true }).click()
  await page.getByRole('textbox', { name: 'Find files', exact: true }).fill('')
  const row = page.locator('[data-orca-explorer-shell] [data-file-explorer-row]').filter({
    has: page.locator('[data-file-explorer-row-name]').getByText('README.md', { exact: true })
  })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.locator('.editor-header-path:visible').first()).toContainText(root)
  await expect(page.locator('.rich-markdown-editor:visible')).toBeVisible()
}

export async function appendToReadme(page: Page, text: string): Promise<void> {
  await page.locator('.rich-markdown-editor:visible').click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
}
