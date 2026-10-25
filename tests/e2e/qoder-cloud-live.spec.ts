/**
 * Live positive path: needs ORCA_QODER_LIVE_TOKEN in the runner's env. Skipped otherwise,
 * so CI never depends on a vendor account. The token reaches the app only through the
 * launch env and is never written to a fixture, screenshot name, or log line.
 *
 * The non-English alternatives in these matchers are the shipped translations of the labels
 * under test: the app runs in the host's locale, so an assertion on English alone would fail
 * on a Chinese desktop.
 */

import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const LIVE_TOKEN = process.env.ORCA_QODER_LIVE_TOKEN ?? ''

// @headful on request so a human can watch the window; it still comes up without taking focus.
test.describe('Qoder Cloud Agents live sessions @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  test('lists real sessions in the sidebar group', async ({ orcaPage }, testInfo) => {
    await waitForSessionReady(orcaPage)

    const section = orcaPage.locator('[data-cloud-sessions-section]')
    await expect(section).toBeVisible({ timeout: 30_000 })
    const rows = section.locator('li')
    await expect(rows.first()).toBeVisible({ timeout: 30_000 })
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    // Why: locale-independent — every row is a button that opens the vendor console URL.
    await expect(rows.first().getByRole('button')).toBeVisible()
    await expect(rows.first().locator('.truncate')).not.toBeEmpty()
    expect(await section.locator('p').count()).toBe(0)
    await orcaPage.screenshot({ path: testInfo.outputPath('live-sidebar.png') })
    const states = await rows.evaluateAll((items) =>
      items.map((li) => li.querySelector('button > span:nth-child(3)')?.textContent ?? '')
    )
    const tally = states.reduce<Record<string, number>>(
      (acc, s) => ((acc[s] = (acc[s] ?? 0) + 1), acc),
      {}
    )
    testInfo.annotations.push({
      type: 'sessions',
      description: `${count} ${JSON.stringify(tally)}`
    })
    // Why: ORCA_QODER_LIVE_LINGER_MS lets a reviewer look at the real window before teardown.
    const linger = Number(process.env.ORCA_QODER_LIVE_LINGER_MS ?? '0')
    if (linger > 0) {
      await orcaPage.waitForTimeout(linger)
    }
  })
})

test.describe('Qoder Cloud Agents transcript drawer @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  test('opens a read-only transcript for the first session', async ({ orcaPage }, testInfo) => {
    await waitForSessionReady(orcaPage)
    const section = orcaPage.locator('[data-cloud-sessions-section]')
    const firstRow = section.locator('li button').first()
    await expect(firstRow).toBeVisible({ timeout: 30_000 })
    await firstRow.click()

    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    // Why: a spinner that never settles was the first live failure; the view must reach content or an error.
    await expect(sheet.locator('[data-slot="sheet-content"] header, header').first()).toBeVisible()
    await expect
      .poll(async () => (await sheet.locator('.animate-spin').count()) === 0, { timeout: 30_000 })
      .toBe(true)
    const text = await sheet.innerText()
    expect(text.length).toBeGreaterThan(40)
    // Why: the SSE tail must actually connect against the real API, not silently fall back to polling.
    await expect(
      sheet.locator('header').getByText(/live|实时|ライブ|실시간|direct|vivo/)
    ).toBeVisible({
      timeout: 20_000
    })
    await orcaPage.screenshot({ path: testInfo.outputPath('live-transcript.png') })
    const linger = Number(process.env.ORCA_QODER_LIVE_LINGER_MS ?? '0')
    if (linger > 0) {
      await orcaPage.waitForTimeout(linger)
    }
  })
})

test.describe('Qoder Cloud Agents outcomes @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  // Optional account fixtures are supplied by the runner, never committed.
  const cases: readonly (readonly [string, string, RegExp])[] = [
    [
      'satisfied',
      process.env.ORCA_QODER_LIVE_SATISFIED_SESSION_ID ?? '',
      /Criteria met|已满足|基準を満たし|기준 충족|remplis|cumplidos/
    ],
    [
      'iteration-limit',
      process.env.ORCA_QODER_LIVE_ITERATION_LIMIT_SESSION_ID ?? '',
      /iteration limit|迭代上限|反復回数|반복 한도|limite d|límite de/
    ]
  ]
  for (const [name, sessionId, expected] of cases) {
    test(`renders the ${name} verdict`, async ({ orcaPage }, testInfo) => {
      test.skip(!sessionId, 'Optional outcome session ID not configured')
      await waitForSessionReady(orcaPage)
      await expect(orcaPage.locator('[data-cloud-sessions-section]')).toBeVisible({
        timeout: 30_000
      })
      await orcaPage.evaluate(
        (id) => window.__store?.getState().setOpenCloudSessionId(id),
        sessionId
      )
      const sheet = orcaPage.locator('[data-cloud-session-panel]')
      await expect(sheet).toBeVisible({ timeout: 10_000 })
      const banner = sheet.getByRole('region', {
        name: /Acceptance criteria|验收标准|受け入れ基準|수락 기준|acceptation|aceptación/
      })
      await expect(banner).toBeVisible({ timeout: 30_000 })
      await expect(banner.getByText(expected)).toBeVisible()
      await orcaPage.screenshot({ path: testInfo.outputPath(`outcome-${name}.png`) })
      const linger = Number(process.env.ORCA_QODER_LIVE_LINGER_MS ?? '0')
      if (linger > 0) {
        await orcaPage.waitForTimeout(linger)
      }
    })
  }
})

test.describe('Qoder Cloud Agents artifacts and errors @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  test('previews delivered images from signed URLs', async ({ orcaPage }, testInfo) => {
    const sessionId = process.env.ORCA_QODER_LIVE_ARTIFACT_SESSION_ID ?? ''
    test.skip(!sessionId, 'ORCA_QODER_LIVE_ARTIFACT_SESSION_ID not set')
    await waitForSessionReady(orcaPage)
    await expect(orcaPage.locator('[data-cloud-sessions-section]')).toBeVisible({ timeout: 30_000 })
    await orcaPage.evaluate((id) => window.__store?.getState().setOpenCloudSessionId(id), sessionId)
    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    const strip = sheet.getByRole('region', {
      name: /Delivered files|交付的文件|納品|전달된|livrés|entregados/
    })
    await expect(strip).toBeVisible({ timeout: 30_000 })
    // Why: the strip must show real pixels, i.e. a signed URL that the renderer could load.
    const firstImage = strip.locator('img').first()
    await expect(firstImage).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => firstImage.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        timeout: 30_000
      })
      .toBeGreaterThan(0)
    const tiles = await strip.locator('button').count()
    expect(tiles).toBeGreaterThanOrEqual(1)
    // Why: every tile resolves its own signed URL; wait until most have pixels before the screenshot.
    await expect
      .poll(
        () =>
          strip
            .locator('img')
            .evaluateAll(
              (imgs) =>
                imgs.filter((img) => img instanceof HTMLImageElement && img.naturalWidth > 0).length
            ),
        { timeout: 45_000 }
      )
      .toBeGreaterThanOrEqual(1)
    await orcaPage.screenshot({ path: testInfo.outputPath('artifacts.png') })
  })

  test('renders an exhausted MCP auth failure as a session error', async ({
    orcaPage
  }, testInfo) => {
    const sessionId = process.env.ORCA_QODER_LIVE_ERROR_SESSION_ID ?? ''
    test.skip(!sessionId, 'ORCA_QODER_LIVE_ERROR_SESSION_ID not set')
    await waitForSessionReady(orcaPage)
    await expect(orcaPage.locator('[data-cloud-sessions-section]')).toBeVisible({ timeout: 30_000 })
    await orcaPage.evaluate((id) => window.__store?.getState().setOpenCloudSessionId(id), sessionId)
    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    await expect(
      sheet.getByText(
        /Session error|会话错误|セッションエラー|세션 오류|Erreur de session|Error de sesión/
      )
    ).toBeVisible({ timeout: 30_000 })
    await expect(sheet.getByText(/github: /)).toBeVisible()
    await orcaPage.screenshot({ path: testInfo.outputPath('session-error.png') })
  })
})

test.describe('Qoder Cloud Agents schedules @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  test('lists vendor deployments under Automations and links a run to its session', async ({
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await orcaPage.evaluate(() => window.__store?.getState().openAutomationsPage())
    const row = orcaPage.locator('[data-cloud-schedule]').first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    const rows = await orcaPage.locator('[data-cloud-schedule]').count()
    expect(rows).toBeGreaterThanOrEqual(3)
    // Why: the cadence must be the vendor's cron plus timezone, not a reformatted guess.
    await expect(row).toContainText(/\d+ \d+ [\d*]+ [\d*]+ [\d*]+ · (Asia\/|UTC)/)
    // Why: pick a schedule that has run; the weekly one may have no runs yet.
    const ranRow = orcaPage
      .locator('[data-cloud-schedule]')
      .filter({ hasText: /12:30|12:00|10:58|10:30/ })
      .first()
    await ranRow.scrollIntoViewIfNeeded()
    await ranRow.click()
    const runs = orcaPage.locator('[data-cloud-schedule-runs]')
    await expect(runs).toBeVisible({ timeout: 20_000 })
    const openSession = runs
      .getByRole('button', {
        name: /Open session|打开会话|セッションを開く|세션 열기|Ouvrir la session|Abrir sesión/
      })
      .first()
    await expect(openSession).toBeVisible({ timeout: 20_000 })
    await orcaPage.screenshot({ path: testInfo.outputPath('schedules.png') })
    await openSession.click()
    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    // Why: a run's session must render as a transcript, not just open an empty sheet.
    await expect(sheet.locator('header')).toContainText(/sess_/)
    await orcaPage.screenshot({ path: testInfo.outputPath('schedule-run-session.png') })
  })
})

test.describe('Qoder Cloud Agents write controls @headful', () => {
  test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  // Why: the parked session is blocked with a pending tool id, so both the approve bar and the
  // disabled composer must appear. Nothing is submitted: approving would resume someone's work.
  test('shows approve/deny and a disabled composer on a blocked session', async ({
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await expect(orcaPage.locator('[data-cloud-sessions-section]')).toBeVisible({ timeout: 30_000 })
    // Why: the row's own state word is gone by design (only the dot carries it), so the
    // accessible name is what still says which rows are waiting on a human.
    const blockedRow = orcaPage
      .locator('[data-cloud-sessions-section] li button[aria-label]')
      .filter({ has: orcaPage.locator('xpath=.'), hasText: '' })
      .and(
        orcaPage.locator(
          '[aria-label*="待批准"], [aria-label*="Needs approval"], [aria-label*="承認待ち"], [aria-label*="승인 필요"], [aria-label*="Approbation"], [aria-label*="aprobación"]'
        )
      )
      .first()
    await expect(blockedRow).toBeVisible({ timeout: 20_000 })
    await blockedRow.click()
    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    const controls = sheet.locator('[data-cloud-session-controls]')
    await expect(controls).toBeVisible({ timeout: 20_000 })
    await expect(
      controls.getByRole('button', { name: /^(Approve|批准|承認|승인|Approuver|Aprobar)$/ })
    ).toBeVisible()
    await expect(
      controls.getByRole('button', { name: /^(Deny|拒绝|拒否|거부|Refuser|Denegar)$/ })
    ).toBeVisible()
    // Why: the composer stays put while a tool call is pending — only the decision above it
    // is actionable, so it is disabled rather than swapped out for the decision.
    await expect(sheet.locator('textarea')).toBeDisabled()
    await orcaPage.screenshot({ path: testInfo.outputPath('write-controls.png') })
  })
})

test.describe('new cloud session @headful', () => {
  test.use({ orcaAppExtraEnv: { ORCA_QODER_ACCESS_TOKEN: LIVE_TOKEN } })

  test('creates a session from the sidebar dialog', async ({ orcaPage }, testInfo) => {
    test.skip(LIVE_TOKEN.length === 0, 'ORCA_QODER_LIVE_TOKEN not set')
    await waitForSessionReady(orcaPage)
    await expect(orcaPage.locator('[data-cloud-sessions-section]')).toBeVisible({ timeout: 30_000 })
    await orcaPage.getByRole('button', { name: /New cloud session|新建云端会话/ }).click()

    const dialog = orcaPage.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    // Catalog is loaded only once the select has an option.
    const trigger = dialog.getByRole('combobox').first()
    await expect(trigger).toBeVisible({ timeout: 30_000 })
    await expect(trigger).not.toHaveText('')
    await dialog.getByLabel(/Name|名称/).fill('orca create e2e')
    // No prompt and no criteria: the create button must stay disabled.
    const create = dialog.getByRole('button', { name: /Start session|启动会话/ })
    await expect(create).toBeDisabled()
    await dialog.getByLabel(/^Prompt|^提示词/).fill('orca create e2e probe — no turn will be sent')
    await expect(create).toBeEnabled()
    await orcaPage.screenshot({ path: testInfo.outputPath('create-dialog.png') })
    await create.click()

    // Why: the drawer opening on the new session is the proof the vendor accepted the request.
    const sheet = orcaPage.locator('[data-cloud-session-panel]')
    await expect(sheet).toBeVisible({ timeout: 30_000 })
    const headerText = await sheet.locator('header').innerText()
    const match = headerText.match(/sess_[0-9a-z]+/)
    expect(match).not.toBeNull()
    testInfo.annotations.push({ type: 'created', description: match?.[0] ?? '' })
    await orcaPage.screenshot({ path: testInfo.outputPath('created.png') })

    // Why: archiving mid-turn is refused (409), so wait for the session to settle like a user would.
    await expect
      .poll(async () => (await sheet.locator('header').innerText()).includes('空闲'), {
        timeout: 90_000
      })
      .toBe(true)
    // Archive it so the probe does not linger in the account, through the menu a user would use.
    await sheet
      .getByRole('button', { name: /Session actions|会话操作|セッション操作|세션 작업/ })
      .click()
    await orcaPage
      .getByRole('menuitem', { name: /Archive session|归档会话|アーカイブ|보관|Archiver|Archivar/ })
      .click()
    const confirmDialog = orcaPage.getByRole('dialog')
    await expect(
      confirmDialog.getByText(
        /Archive this session\?|归档此会话|アーカイブしますか|보관할까요|Archiver cette session|Archivar esta sesión/
      )
    ).toBeVisible({ timeout: 5_000 })
    await confirmDialog
      .getByRole('button', { name: /^(Archive|归档|アーカイブ|보관|Archiver|Archivar)$/ })
      .click()
    await expect(sheet).toBeHidden({ timeout: 20_000 })
  })
})
