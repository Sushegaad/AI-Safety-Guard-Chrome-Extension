/* ============================================================================
 * AI Safety Guard — Tier A e2e: hermetic composer fixtures (every PR)
 * ----------------------------------------------------------------------------
 * For each supported site: serve a local snapshot of its composer DOM on the
 * REAL origin (route interception — zero live traffic), type a canary secret,
 * and assert the full user-visible chain:
 *
 *   content script injects → badge appears → Enter is intercepted (modal, no
 *   send) → "Send anyway" completes the suppressed send.
 *
 * Deterministic: no network, no login, runs in seconds.
 * Run: npm run e2e   (after npm run build)
 * ========================================================================== */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITES } from '../src/shared/sites.js';
import { ROOT, launchWithExtension, routeFixture, makeCanary, makeReporter } from './harness.mjs';

const r = makeReporter('tier-a');
const context = await launchWithExtension();

for (const site of SITES) {
  const host = site.hosts[0];
  const fixture = readFileSync(join(ROOT, 'e2e', 'fixtures', `${site.id}.html`), 'utf8');
  const inputSel = site.selectors.input[0];
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('[AI Safety Guard]')) errors.push(msg.text());
  });

  try {
    await routeFixture(page, host, fixture);
    await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded' });

    // 1. Composer present (fixture sanity) + content script injected.
    await page.waitForSelector(inputSel, { timeout: 5000 });

    // 2. Type the canary → badge must appear (debounced scan ≈ 300 ms).
    await page.click(inputSel);
    await page.keyboard.type(makeCanary());
    const badge = page.locator('#asg-badge-host');
    await badge.waitFor({ state: 'attached', timeout: 5000 });
    r.ok(`${site.id}: badge appears on canary`, true);
    const badgeText = await page.locator('#asg-badge-host .asg-badge').textContent();
    r.ok(`${site.id}: badge shows Critical`, /Critical/i.test(badgeText || ''));

    // 3. Enter must be intercepted: modal opens, the site did NOT send.
    await page.press(inputSel, 'Enter');
    await page.locator('#asg-modal-host .asg-card').waitFor({ state: 'attached', timeout: 3000 });
    r.ok(`${site.id}: modal intercepts Enter`, true);
    r.ok(`${site.id}: send was blocked`, (await page.evaluate(() => window.__sent)) === false);
    const modalText = await page.locator('#asg-modal-host .asg-card').textContent();
    r.ok(`${site.id}: modal masks the secret`, !/sk-live-[a-zA-Z0-9]{8}/.test(modalText || ''));

    // 4. "Send anyway" → suppressed send goes through (full loop).
    await page.locator('#asg-modal-host .asg-card button', { hasText: 'Send anyway' }).click();
    await page.waitForFunction(() => window.__sent === true, null, { timeout: 3000 });
    r.ok(`${site.id}: send anyway completes the send`, true);

    r.ok(`${site.id}: no extension console errors`, errors.length === 0);
  } catch (e) {
    r.ok(`${site.id}: FAILED — ${String(e).split('\n')[0]}`, false);
    await page
      .screenshot({ path: join(ROOT, 'e2e', 'results', `tier-a-${site.id}-failure.png`) })
      .catch(() => {});
  } finally {
    await page.close().catch(() => {});
  }
}

await context.close();
r.finish();
