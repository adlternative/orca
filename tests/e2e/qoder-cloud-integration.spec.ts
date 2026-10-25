/**
 * Qoder Cloud Agents: Settings card → connect dialog → sidebar "Cloud sessions" group.
 *
 * Runs against the real API (no mock): an invalid token must come back as a vendor
 * rejection, never as "unreachable", and the sidebar group must only appear once a
 * credential exists. The env-var path seeds that credential without the OS keychain.
 */

import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { dismissTransientAnnouncement } from './helpers/ssh-config-host-picker'
import { waitForSessionReady } from './helpers/store'

async function openIntegrationsSettings(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    await store.getState().updateSettings({ uiLanguage: 'en' })
    store.getState().openSettingsTarget({ pane: 'integrations', repoId: null })
    store.getState().openSettingsPage()
  })
  await expect(page.getByPlaceholder('Search settings')).toBeVisible({ timeout: 10_000 })
  await dismissTransientAnnouncement(page)
}

test.describe('Qoder Cloud Agents integration', () => {
  test('card, dialog validation, and real API rejection of a bad token', async ({
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await openIntegrationsSettings(orcaPage)

    const card = orcaPage.locator('[data-settings-section="integrations-qoder-cloud"]')
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByText('Qoder Cloud Agents')).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText('Not connected')).toBeVisible()
    await orcaPage.screenshot({ path: testInfo.outputPath('01-card-disconnected.png') })

    // Why: an unconfigured integration must not reserve sidebar space.
    await expect(orcaPage.locator('[data-cloud-sessions-section]')).toHaveCount(0)

    await card.getByRole('button', { name: 'Connect' }).click()
    const dialog = orcaPage.getByRole('dialog', { name: 'Connect Qoder Cloud Agents' })
    await expect(dialog).toBeVisible()
    const connect = dialog.getByRole('button', { name: 'Connect' })
    await expect(connect).toBeDisabled()

    const tokenInput = dialog.locator('input[type="password"]')
    await tokenInput.fill('orca-e2e-not-a-real-token')
    await expect(connect).toBeEnabled()

    // http:// is refused before any request leaves the machine.
    const baseUrlInput = dialog.getByPlaceholder('https://api.qoder.com/api/v1/cloud')
    await baseUrlInput.fill('http://api.qoder.com/api/v1/cloud')
    await connect.click()
    await expect(dialog.getByText('must be an https:// URL')).toBeVisible()

    // Real network: the vendor must classify the token as rejected, not unreachable.
    await baseUrlInput.fill('')
    await connect.click()
    await expect(dialog.getByText(/rejected this token/i)).toBeVisible({ timeout: 20_000 })
    await orcaPage.screenshot({ path: testInfo.outputPath('02-dialog-rejected.png') })
    await expect(dialog).toHaveAttribute('data-state', 'open')
    await expect(tokenInput).toHaveValue('orca-e2e-not-a-real-token')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(card.getByText('Not connected')).toBeVisible()
  })
})

test.describe('Qoder Cloud Agents sidebar group', () => {
  // Why: env wins over the stored credential, so the group renders without a keychain write.
  // The token is invalid on purpose: the group must still show up and report the failure.
  test.use({
    orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: 'orca-e2e-not-a-real-token' }
  })

  test('appears once configured and surfaces the vendor failure', async ({
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await orcaPage.evaluate(async () => {
      await window.__store?.getState().updateSettings({ uiLanguage: 'en' })
    })

    const section = orcaPage.locator('[data-cloud-sessions-section]')
    await expect(section).toBeVisible({ timeout: 30_000 })
    await expect(section.getByText('Cloud sessions')).toBeVisible()
    // Why: a rejected token must read as a message, not as "no active sessions".
    await expect(section.getByText(/rejected the saved token/i)).toBeVisible({ timeout: 20_000 })
    await orcaPage.screenshot({ path: testInfo.outputPath('03-sidebar-group.png') })

    await section.getByRole('button', { name: 'Toggle cloud sessions' }).click()
    await expect(section.getByText(/rejected the saved token/i)).toBeHidden()

    await openIntegrationsSettings(orcaPage)
    const card = orcaPage.locator('[data-settings-section="integrations-qoder-cloud"]')
    await card.scrollIntoViewIfNeeded()
    await expect(card.getByText('Connected')).toBeVisible({ timeout: 15_000 })
    await expect(card.getByText(/Configured via environment variables/)).toBeVisible()
    await orcaPage.screenshot({ path: testInfo.outputPath('04-card-env-managed.png') })
  })
})
