/* ============================================================================
 * AI Safety Guard — Phase 4 tests (storage, message router, popup, onboarding)
 * Run: node src/background/phase4.test.mjs
 * ========================================================================== */

import { JSDOM } from 'jsdom';

let pass = 0;
let fail = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : (fail++, fails.push(n)));
const tick = () => new Promise((r) => setTimeout(r, 0));

// --- Fake chrome.storage.local backed by a plain object ---------------------
function makeStorageArea(initial = {}) {
  const data = { ...initial };
  return {
    _data: data,
    async get(defaults) {
      if (typeof defaults === 'string') return { [defaults]: data[defaults] };
      const out = {};
      for (const [k, v] of Object.entries(defaults || {})) out[k] = k in data ? data[k] : v;
      return out;
    },
    async set(patch) {
      Object.assign(data, patch);
    },
  };
}

// service-worker.js registers chrome listeners at import time — stub chrome first.
globalThis.chrome = {
  runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
  tabs: {
    async query() {
      return [];
    },
    async sendMessage() {},
  },
};

const { DEFAULT_SETTINGS, MSG, withDefaults, readSettings, writeSettings, bumpCatch, sanitizePatch } =
  await import('../shared/storage.js');
const { routeMessage } = await import('./service-worker.js');

/* --------------------------------------------------------- storage schema */
ok('schema: sensitivity default balanced', DEFAULT_SETTINGS.sensitivity === 'balanced');
ok('schema: no rewrite settings (B2 removed)', !('allowRewrite' in DEFAULT_SETTINGS) && !('rewriteApiEndpoint' in DEFAULT_SETTINGS));
ok('schema: scanAttachments on by default', DEFAULT_SETTINGS.scanAttachments === true);
ok('schema: analytics on by default', DEFAULT_SETTINGS.analyticsEnabled === true);
ok('schema: onboarding incomplete by default', DEFAULT_SETTINGS.onboardingComplete === false);
ok('schema: counter starts at 0', DEFAULT_SETTINGS.riskySubmissionsCaught === 0);
ok('schema: all sites enabled by default', Object.values(DEFAULT_SETTINGS.enabledSites).every(Boolean));
ok('withDefaults merges enabledSites by key', withDefaults({ enabledSites: { claude: false } }).enabledSites.chatgpt === true);
ok('withDefaults keeps override', withDefaults({ enabledSites: { claude: false } }).enabledSites.claude === false);

/* ------------------------------------------------------- storage helpers */
{
  const area = makeStorageArea();
  const s = await readSettings(area);
  ok('readSettings returns defaults', s.sensitivity === 'balanced' && s.riskySubmissionsCaught === 0);
  await writeSettings({ sensitivity: 'strict' }, area);
  ok('writeSettings persists', (await readSettings(area)).sensitivity === 'strict');
  const n1 = await bumpCatch(area);
  const n2 = await bumpCatch(area);
  ok('bumpCatch increments', n1 === 1 && n2 === 2);
  ok('bumpCatch persisted', (await readSettings(area)).riskySubmissionsCaught === 2);
}

/* ------------------------------------------------------- message router */
{
  const area = makeStorageArea();
  const deps = {
    readSettings: () => readSettings(area),
    writeSettings: (p) => writeSettings(p, area),
    bumpCatch: () => bumpCatch(area),
    broadcast: () => (deps._broadcasts = (deps._broadcasts || 0) + 1),
  };
  const got = await routeMessage({ type: MSG.GET_SETTINGS }, deps);
  ok('router GET_SETTINGS returns settings', got.sensitivity === 'balanced');

  const set = await routeMessage({ type: MSG.SET_SETTINGS, patch: { sensitivity: 'basic' } }, deps);
  ok('router SET_SETTINGS writes', set.sensitivity === 'basic');
  ok('router SET_SETTINGS broadcasts', deps._broadcasts === 1);

  const caught = await routeMessage({ type: MSG.RECORD_CATCH }, deps);
  ok('router RECORD_CATCH increments', caught.riskySubmissionsCaught === 1);

  // EXTRACT_PDF relays to the offscreen parser (injected here).
  const pdfOk = await routeMessage({ type: MSG.EXTRACT_PDF, dataB64: 'AAA' }, {
    ...deps,
    extractPdf: async (b64) => `TEXT(${b64})`,
  });
  ok('router EXTRACT_PDF returns offscreen text', pdfOk.text === 'TEXT(AAA)');
  const pdfErr = await routeMessage({ type: MSG.EXTRACT_PDF, dataB64: 'x' }, {
    ...deps,
    extractPdf: async () => {
      throw new Error('offscreen_down');
    },
  });
  ok('router EXTRACT_PDF surfaces error', !!pdfErr.error && pdfErr.error.includes('offscreen_down'));

  const bad = await routeMessage({ type: 'NONSENSE' }, deps);
  ok('router unknown message -> error', bad.ok === false);
}

/* --------------------------------------------- validation (security #1) */
{
  const dirty = sanitizePatch({
    sensitivity: 'ultra', // invalid -> dropped
    enabled: 1, // coerced bool
    evilKey: 'pwn', // unknown -> dropped
    enabledSites: { claude: 0, bogus: true }, // unknown site dropped, bool coerced
    customDomains: ['HTTPS://Foo.AI', 'not a domain', 123],
    riskySubmissionsCaught: -5,
  });
  ok('sanitize: drops invalid sensitivity', !('sensitivity' in dirty));
  ok('sanitize: coerces enabled to bool', dirty.enabled === true);
  ok('sanitize: drops unknown keys', !('evilKey' in dirty));
  ok('sanitize: keeps only known sites', dirty.enabledSites.claude === false && !('bogus' in dirty.enabledSites));
  ok('sanitize: normalizes custom domains', dirty.customDomains.length === 1 && dirty.customDomains[0] === 'foo.ai');
  ok('sanitize: clamps counter >= 0', dirty.riskySubmissionsCaught === 0);

  // writeSettings must persist only sanitized values
  const area = makeStorageArea();
  await writeSettings({ sensitivity: 'strict', evilKey: 'x' }, area);
  ok('writeSettings: persists clean value', area._data.sensitivity === 'strict');
  ok('writeSettings: never persists unknown key', !('evilKey' in area._data));
}

/* ------------------------------------------------- popup (jsdom) -------- */
{
  const dom = new JSDOM(
    '<!DOCTYPE html><body><div id="popup-body"></div><span id="version"></span></body>',
    { url: 'https://example.com/' }
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;

  const sent = [];
  const settings = withDefaults({ riskySubmissionsCaught: 142 });
  const send = async (m) => {
    sent.push(m);
    if (m.type === MSG.GET_SETTINGS) return settings;
    if (m.type === MSG.SET_SETTINGS) return withDefaults({ ...settings, ...m.patch });
    return { ok: true };
  };

  const { initPopup } = await import('../popup/popup.js');
  const popup = initPopup({ doc: document, send });
  await tick();

  const body = document.getElementById('popup-body');
  ok('popup: 3 sensitivity buttons', body.querySelectorAll('.segmented__btn').length === 3);
  ok(
    'popup: balanced pressed by default',
    body.querySelector('.segmented__btn[data-mode="balanced"]').getAttribute('aria-pressed') === 'true'
  );
  ok('popup: 4 site toggles', body.querySelectorAll('.switch[data-site]').length === 4);
  ok('popup: scanAttachments toggle present', !!body.querySelector('.switch[data-setting="scanAttachments"]'));
  ok('popup: counter shows 142', body.querySelector('.stat__num').textContent === '142');

  // click Strict -> persists SET_SETTINGS
  body.querySelector('.segmented__btn[data-mode="strict"]').click();
  await tick();
  const setMsg = sent.find((m) => m.type === MSG.SET_SETTINGS && m.patch.sensitivity);
  ok('popup: clicking sensitivity persists', setMsg && setMsg.patch.sensitivity === 'strict');

  // toggle a site off
  const claudeToggle = body.querySelector('.switch[data-site="claude"]');
  claudeToggle.checked = false;
  claudeToggle.dispatchEvent(new dom.window.Event('change'));
  await tick();
  const siteMsg = sent.find((m) => m.type === MSG.SET_SETTINGS && m.patch.enabledSites);
  ok('popup: toggling site persists enabledSites', siteMsg && siteMsg.patch.enabledSites.claude === false);
  ok('popup api exposes settings', !!popup.getSettings());
}

/* --------------------------------------------- onboarding (jsdom) ------ */
{
  const dom = new JSDOM('<!DOCTYPE html><body><div id="onboarding"></div></body>', {
    url: 'https://example.com/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;

  const sent = [];
  let doneCalled = false;
  const send = async (m) => {
    sent.push(m);
    return withDefaults({});
  };

  const { initOnboarding } = await import('../onboarding/onboarding.js');
  const ob = initOnboarding({ doc: document, send, onDone: () => (doneCalled = true) });
  const root = document.getElementById('onboarding');

  ok('onboarding: step 1 title', root.textContent.includes('A safety net for AI'));
  ok('onboarding: step 1 branded hero + wordmark', !!root.querySelector('.hero') && root.querySelector('.hero__name').textContent === 'AI Safety Guard');
  ok('onboarding: step 1 intro line', root.textContent.includes('before private info leaves'));
  ok('onboarding: step 1 has 3 benefits', root.querySelectorAll('.benefit').length === 3);

  // Continue -> step 2
  root.querySelector('.cta').click();
  ok('onboarding: step 2 title', root.textContent.includes('How careful should we be?'));
  ok('onboarding: 3 sensitivity cards', root.querySelectorAll('.opt-card').length === 3);
  ok(
    'onboarding: balanced preselected + RECOMMENDED',
    !!root.querySelector('.opt-card--selected .opt-card__rec')
  );

  // pick Strict, Continue -> step 3
  root.querySelector('.opt-card[data-mode="strict"]').click();
  root.querySelector('.cta').click();
  ok('onboarding: step 3 title', root.textContent.includes('Where should we watch?'));
  // Updated Design v1: one toggle per provider (incl. "Microsoft Copilot").
  ok('onboarding: per-provider toggles (5)', root.querySelectorAll('.switch[data-site]').length === 5);
  ok(
    'onboarding: each provider listed individually',
    ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Microsoft Copilot'].every((n) => root.textContent.includes(n))
  );

  // turn Perplexity off; Copilot must stay independent
  const ppx = root.querySelector('.switch[data-site="perplexity"]');
  ppx.checked = false;
  ppx.dispatchEvent(new dom.window.Event('change'));

  // Start protecting me
  root.querySelector('.cta').click();
  await tick();
  const fin = sent.find((m) => m.type === MSG.SET_SETTINGS);
  ok('onboarding: finish persists settings', !!fin);
  ok('onboarding: sensitivity chosen saved', fin.patch.sensitivity === 'strict');
  ok('onboarding: onboardingComplete true', fin.patch.onboardingComplete === true);
  ok('onboarding: only the toggled site is off', fin.patch.enabledSites.perplexity === false && fin.patch.enabledSites.copilot === true);
  ok('onboarding: others still on', fin.patch.enabledSites.claude === true && fin.patch.enabledSites.gemini === true && fin.patch.enabledSites.chatgpt === true);
  ok('onboarding: onDone (close tab) called', doneCalled === true);
  ok('onboarding api exposes state', ob.getState().step === 3);
}

/* ----------------------------------- site registry (DRY #4) ------------- */
{
  const { SITES, SITE_IDS, manifestMatchPatterns, siteForHost, defaultEnabledSites } =
    await import('../shared/sites.js');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  ok('registry: 5 sites', SITES.length === 5);
  ok('registry: defaults all-on', Object.values(defaultEnabledSites()).every(Boolean) && Object.keys(defaultEnabledSites()).length === 5);
  ok('registry: host resolution', siteForHost('chatgpt.com').id === 'chatgpt' && siteForHost('www.perplexity.ai').id === 'perplexity');
  ok('registry: unknown host -> null', siteForHost('example.com') === null);
  ok('registry: copilot full label', SITES.find((s) => s.id === 'copilot').label === 'Microsoft Copilot');

  // MANIFEST DRIFT GUARD: manifest host arrays must equal the registry.
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const expected = [...manifestMatchPatterns()].sort();
  const eq = (arr) => JSON.stringify([...arr].sort()) === JSON.stringify(expected);
  ok('manifest: host_permissions match registry', eq(manifest.host_permissions));
  ok('manifest: content_scripts.matches match registry', eq(manifest.content_scripts[0].matches));
  ok('manifest: web_accessible_resources.matches match registry', eq(manifest.web_accessible_resources[0].matches));

  // Adapter dispatcher derives from the registry (no per-site files).
  globalThis.location = { hostname: 'chatgpt.com' };
  const { getAdapter, ADAPTERS } = await import('../content/sites/index.js');
  ok('adapters: built for every site', SITE_IDS.every((id) => !!ADAPTERS[id]));
  ok('adapters: getAdapter resolves by host', getAdapter('claude.ai').id === 'claude');
  ok('adapters: unknown host -> custom', getAdapter('nope.example').id === 'custom');
}

/* ------------------------------ token single-source (DRY #5) ------------ */
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { rootVars, generateTokensCss } = await import('../../scripts/gen-tokens.mjs');
  const { componentCss } = await import('../shared/styles.js');

  const css = readFileSync(join(ROOT, 'src/shared/tokens.css'), 'utf8');
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)[1];
  const inCss = {};
  for (const m of root.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) inCss[m[1]] = m[2].trim();
  const fromConstants = rootVars();

  let drift = 0;
  for (const [k, v] of Object.entries(fromConstants)) {
    if (String(inCss[k]) !== String(v)) drift++;
  }
  ok('tokens.css :root is generated from constants (no drift)', drift === 0);
  ok('tokens.css covers every constant token', Object.keys(fromConstants).every((k) => k in inCss));
  // The shared component classes (single source) must be present verbatim.
  ok('tokens.css contains the shared component classes', css.includes(componentCss().trim()));
  // tokens.css must equal the generator output exactly (no hand-edits).
  ok('tokens.css equals the generator output', css === generateTokensCss());
}

/* ---------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All Phase 4 tests passed ✓');
