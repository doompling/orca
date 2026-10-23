import type { Page } from '@stablyai/playwright-test'

/** Closes any upstream feature-tip dialog over the window; after onboarding they open on their own. */
export async function closeFeatureTips(page: Page, waitMs = 1500): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tip = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: 'Close', exact: true }) })
      .first()
    const visible = await tip
      .waitFor({ state: 'visible', timeout: waitMs })
      .then(() => true)
      .catch(() => false)
    if (!visible) {
      return
    }
    await tip.getByRole('button', { name: 'Close', exact: true }).click()
    await tip.waitFor({ state: 'hidden' })
  }
}
