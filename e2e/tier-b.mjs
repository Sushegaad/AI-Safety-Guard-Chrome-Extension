/* ============================================================================
 * AI Safety Guard — Tier B e2e: live-site drift probe (weekly, advisory)
 * ----------------------------------------------------------------------------
 * Visits the five real sites LOGGED OUT and reports, per site:
 *
 *   ok            composer found, canary typed, badge appeared
 *   drift         composer found but the badge did not appear  ← the signal
 *   no-composer   none of our input selectors match the page   ← also drift-ish
 *   unverifiable  login wall / no composer rendered logged-out (Claude, Gemini
 *                 usually) — recorded, never failed
 *   unreachable   navigation failed (network, geo-block, interstitial)
 *
 * Exit code 1 only on drift/no-composer, so CI can file an issue; the run is
 * advisory and never gates merges. Results: e2e/results/tier-b.json (+ shots).
 * Run: npm run e2e:live   (after npm run build)
 * ========================================================================== */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITES } from '../src/shared/sites.js';
import { ROOT, launchWithExtension, makeCanary, makeReporter } from './harness.mjs';

const RESULTS = join(ROOT, 'e2e', 'results');
const r = makeReporter('tier-b');
const context = await launchWithExtension();
const report = [];

for (const site of SITES) {
  const host = site.hosts[0];
  const page = await context.newPage();
  const entry = { site: site.id, host, selectorVersion: site.selectorVersion, status: 'unreachable', detail: '' };

  try {
    await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000); // SPAs settle slowly logged-out

    // Which of our input selectors (primary + fallbacks) matches the live DOM?
    const matched = await page.evaluate(
      (sels) => sels.find((s) => !!document.querySelector(s)) || null,
      site.selectors.input
    );

    if (!matched) {
      const isLoginish = await page.evaluate(() => {
        const t = document.body ? document.body.innerText.toLowerCase() : '';
        return /log in|sign in|sign up|continue with|verify you are|captcha/.test(t);
      });
      entry.status = isLoginish ? 'unverifiable' : 'no-composer';
      entry.detail = isLoginish
        ? 'login wall — composer not rendered logged-out'
        : `none of ${site.selectors.input.length} input selectors matched`;
    } else {
      entry.detail = `matched input selector: ${matched}`;
      try {
        await page.click(matched, { timeout: 5000 });
        await page.keyboard.type(makeCanary(), { delay: 10 });
        await page
          .locator('#asg-badge-host')
          .waitFor({ state: 'attached', timeout: 5000 });
        entry.status = 'ok';
      } catch {
        entry.status = 'drift';
        entry.detail += ' — but the badge did not appear within 5s';
      }
    }
  } catch (e) {
    entry.detail = String(e).split('\n')[0];
  } finally {
    await page
      .screenshot({ path: join(RESULTS, `tier-b-${site.id}.png`), fullPage: false })
      .catch(() => {});
    await page.close().catch(() => {});
  }

  report.push(entry);
  console.log(`[tier-b] ${site.id.padEnd(11)} ${entry.status.padEnd(13)} ${entry.detail}`);
  r.ok(`${site.id}: not drifted (${entry.status})`, entry.status !== 'drift' && entry.status !== 'no-composer');
}

await context.close();
writeFileSync(join(RESULTS, 'tier-b.json'), JSON.stringify(report, null, 2));
r.finish();
