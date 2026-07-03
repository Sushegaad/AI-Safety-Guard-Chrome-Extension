/* ============================================================================
 * AI Safety Guard — fixture/registry drift guard (runs in npm test, no browser)
 * ----------------------------------------------------------------------------
 * The Tier A e2e relies on e2e/fixtures/<site>.html reproducing each site's
 * composer DOM. This jsdom check guarantees every fixture keeps matching the
 * PRIMARY selectors in src/shared/sites.js — so a selector edit that forgets
 * the fixture (or vice versa) fails fast in unit tests, not in CI e2e.
 * ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from '../src/shared/sites.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let pass = 0;
let fail = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : (fail++, fails.push(n)));

for (const site of SITES) {
  const file = join(DIR, `${site.id}.html`);
  ok(`${site.id}: fixture exists`, existsSync(file));
  if (!existsSync(file)) continue;
  const doc = new JSDOM(readFileSync(file, 'utf8')).window.document;

  ok(`${site.id}: PRIMARY input selector matches fixture`, !!doc.querySelector(site.selectors.input[0]));
  ok(`${site.id}: PRIMARY submit selector matches fixture`, !!doc.querySelector(site.selectors.submit[0]));
  const anchor = site.selectors.badgeAnchor && site.selectors.badgeAnchor[0];
  ok(`${site.id}: badge anchor matches fixture`, !anchor || !!doc.querySelector(anchor));
  ok(`${site.id}: fixture tracks sends (window.__sent)`, /__sent/.test(readFileSync(file, 'utf8')));
  ok(`${site.id}: selectorVersion present`, Number.isInteger(site.selectorVersion));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All fixture drift-guard tests passed ✓');
