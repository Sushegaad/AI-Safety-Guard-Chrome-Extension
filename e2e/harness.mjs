/* ============================================================================
 * AI Safety Guard — e2e harness (Playwright + built extension)
 * ----------------------------------------------------------------------------
 * Launches Chromium with the BUILT extension (dist/) in a throwaway profile.
 * Requires `npm run build` first and `npx playwright install chromium` once.
 *
 * Headless note: extensions need Chromium's *new* headless mode — Playwright's
 * `channel: 'chromium'` build. If your environment can't run it headless, set
 * HEADED=1 (CI wraps with xvfb-run instead).
 * ========================================================================== */

import { chromium } from 'playwright';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = join(ROOT, 'dist');
export const RESULTS_DIR = join(ROOT, 'e2e', 'results');

// Random canary each run: an API key (critical) + an SSN. Never a real secret.
export function makeCanary() {
  const suffix = Array.from({ length: 16 }, () =>
    'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 55))
  ).join('');
  return `please debug this: sk-live-${suffix} for ssn 123-45-6789`;
}

export async function launchWithExtension() {
  if (!existsSync(join(DIST, 'manifest.json'))) {
    throw new Error('dist/ not built — run `npm run build` first');
  }
  const userDataDir = mkdtempSync(join(tmpdir(), 'aisg-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // First-install onboarding tab opens automatically — close it so tests own
  // the tab list.
  await context.waitForEvent('page', { timeout: 5000 }).catch(() => {});
  for (const p of context.pages()) {
    if (p.url().includes('onboarding')) await p.close().catch(() => {});
  }
  return context;
}

/** Serve a local fixture as if it were the real site (no network traffic). */
export async function routeFixture(page, host, fixtureHtml) {
  await page.route(`https://${host}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: fixtureHtml })
  );
}

/* Minimal assertion helpers (same no-framework style as the unit suites). */
export function makeReporter(name) {
  let pass = 0;
  const fails = [];
  return {
    ok(label, cond) {
      if (cond) pass++;
      else fails.push(label);
    },
    finish() {
      console.log(`\n[${name}] ${pass} passed, ${fails.length} failed`);
      if (fails.length) {
        fails.forEach((f) => console.log('  ✗ ' + f));
        process.exit(1);
      }
      console.log(`[${name}] all green ✓`);
    },
  };
}
