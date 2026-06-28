/* ============================================================================
 * AI Safety Guard — Static privacy audit
 * Run: npm run audit:privacy   (node scripts/privacy-audit.mjs)
 *
 * Enforces the product's core privacy promises by scanning the source tree:
 *   1. The ONLY network egress is the B2 cloud rewrite (rewriter.js). Fonts are
 *      fetched from the extension's own origin (local resource), not the network.
 *   2. The rewrite call is consent-gated (never invoked before allowRewrite).
 *   3. chrome.storage is written only via storage.js, and only the settings
 *      schema + counter — never prompt text.
 *   4. No analytics/beacon/websocket channels exist that could carry prompt text.
 *
 * Exits non-zero on any violation so it can run in CI / the build.
 * ========================================================================== */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const isTest = (f) => /\.test\.mjs$/.test(f);
const rel = (f) => relative(ROOT, f);
const raw = (f) => readFileSync(f, 'utf8');
// Strip comments so that mentions of "fetch" etc. in documentation don't trip
// the network scanner — we only care about actual code.
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
const code = (f) => stripComments(raw(f));

let failed = 0;
const note = (label, passOk, detail = '') => {
  console.log(`  [${passOk ? 'PASS' : 'FAIL'}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!passOk) failed++;
};

console.log('AI Safety Guard — privacy audit\n');

/* 1. Network egress surface ------------------------------------------------ */
const NET = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/;
const netFiles = files.filter((f) => !isTest(f) && NET.test(code(f))).map(rel);
// Allowed: rewriter.js (cloud rewrite egress) and fonts.js (extension-origin fetch of own woff2).
const ALLOWED_NET = ['src/content/rewriter.js', 'src/content/ui/fonts.js'];
const unexpectedNet = netFiles.filter((f) => !ALLOWED_NET.includes(f));
note('only rewriter + fonts touch network APIs', unexpectedNet.length === 0, unexpectedNet.join(', ') || `found in: ${netFiles.join(', ')}`);

// fonts.js must fetch the extension's OWN resource (getURL), not an arbitrary URL.
const fontsSrc = code(join(SRC, 'content/ui/fonts.js'));
note(
  'fonts fetch is extension-origin only (chrome.runtime.getURL)',
  /fetch\(\s*chrome\.runtime\.getURL/.test(fontsSrc) && !/fetch\(\s*['"]https?:/.test(fontsSrc)
);

/* 2. Rewrite is consent-gated --------------------------------------------- */
const modalSrc = code(join(SRC, 'content/ui/modal.js'));
note(
  'B2 rewrite is gated behind consent (allowRewrite / onEnableConsent)',
  /onEnableConsent/.test(modalSrc) && /state\.allowRewrite/.test(modalSrc) && /if \(state\.allowRewrite\) triggerRewrite\(\)/.test(modalSrc)
);
const contentSrc = code(join(SRC, 'content/content.js'));
note(
  'content getRewriteConfig reads allowRewrite (no unconditional rewrite)',
  /getRewriteConfig:/.test(contentSrc) && /allowRewrite: settings\.allowRewrite/.test(contentSrc)
);

/* 3. Storage writes: only via storage.js, only schema + counter ------------ */
const STORE_WRITE = /chrome\.storage\.local\.set|storage\.set\(/;
const writers = files.filter((f) => !isTest(f) && STORE_WRITE.test(code(f))).map(rel);
note('storage writes occur only in shared/storage.js', writers.length === 1 && writers[0] === 'src/shared/storage.js', writers.join(', '));

// storage.js must never persist a prompt/text/raw field.
const storeSrc = code(join(SRC, 'shared/storage.js'));
const FORBIDDEN_KEYS = /\b(prompt|promptText|rawValue|inputText|messageText)\b/;
note('storage schema contains no prompt/raw-text fields', !FORBIDDEN_KEYS.test(storeSrc));

// The settings schema keys (audit visibility).
const schemaKeys = (storeSrc.match(/DEFAULT_SETTINGS = Object\.freeze\(\{([\s\S]*?)\}\)/) || [])[1] || '';
const hasCounterOnly = /riskySubmissionsCaught/.test(schemaKeys) && !FORBIDDEN_KEYS.test(schemaKeys);
note('settings schema = preferences + counter only', hasCounterOnly);

/* 4. Prompt text only travels via the consented REWRITE message ------------ */
// Find every sendMessage(...) call object; any that carries prompt/text/rawValue
// MUST be the REWRITE message (the one consented egress). Nothing else may.
const promptMsgViolations = [];
for (const f of files.filter((x) => !isTest(x))) {
  const src = code(f);
  const calls = src.match(/sendMessage\(\s*\{[\s\S]*?\}\s*\)/g) || [];
  for (const call of calls) {
    if (/\b(prompt|rawValue|inputText)\b/.test(call) && !/REWRITE/.test(call)) {
      promptMsgViolations.push(rel(f));
    }
  }
}
note('prompt text only sent via the REWRITE message', promptMsgViolations.length === 0, promptMsgViolations.join(', '));

// The service worker must refuse REWRITE without consent (defense in depth).
const swSrc = code(join(SRC, 'background/service-worker.js'));
note(
  'service worker refuses REWRITE without consent',
  /case MSG\.REWRITE/.test(swSrc) && /if \(!settings\.allowRewrite\) return \{ error: 'consent_required' \}/.test(swSrc)
);

// No third-party analytics endpoints embedded.
const ANALYTICS = /(google-analytics|googletagmanager|segment\.io|mixpanel|amplitude|sentry|bugsnag)/i;
const analyticsFiles = files.filter((f) => !isTest(f) && ANALYTICS.test(code(f))).map(rel);
note('no third-party analytics/telemetry endpoints', analyticsFiles.length === 0, analyticsFiles.join(', '));

/* 5. Detector purity: no I/O in the scan path ------------------------------ */
const detectorSrc = code(join(SRC, 'content/detector.js'));
note('detector.js performs no network I/O', !NET.test(detectorSrc));

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} issue(s).`);
process.exit(failed === 0 ? 0 : 1);
