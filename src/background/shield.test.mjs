/* ============================================================================
 * AI Safety Guard — Shield Mode tests
 * Run: node src/background/shield.test.mjs
 * Covers: settings schema (shieldMode / perSiteNoticeSeen), sanitization, and
 * the service-worker relay that routes approved text from the secure-composer
 * iframe to the originating tab's content script (never via the provider window).
 * ========================================================================== */

let pass = 0;
let fail = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : (fail++, fails.push(n)));

// Capture the service-worker's onMessage listener so we can drive it directly.
let swListener = null;
const tabsSent = [];
globalThis.chrome = {
  runtime: {
    id: 'test-ext-id',
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(fn) { swListener = fn; } },
  },
  permissions: { onRemoved: { addListener() {} } },
  tabs: {
    async query() { return []; },
    async sendMessage(tabId, msg) { tabsSent.push({ tabId, msg }); },
  },
};

const { DEFAULT_SETTINGS, MSG, withDefaults, sanitizePatch } = await import('../shared/storage.js');
await import('./service-worker.js'); // registers swListener

/* ------------------------------------------------ settings schema -------- */
ok('schema: shieldMode default empty', DEFAULT_SETTINGS.shieldMode && Object.keys(DEFAULT_SETTINGS.shieldMode).length === 0);
ok('schema: perSiteNoticeSeen default empty', DEFAULT_SETTINGS.perSiteNoticeSeen && Object.keys(DEFAULT_SETTINGS.perSiteNoticeSeen).length === 0);
ok('withDefaults: shieldMode merged', withDefaults({ shieldMode: { chatgpt: true } }).shieldMode.chatgpt === true);
ok('withDefaults: perSiteNoticeSeen merged', withDefaults({ perSiteNoticeSeen: { claude: true } }).perSiteNoticeSeen.claude === true);
ok('withDefaults: default is off for unset site', withDefaults({ shieldMode: { chatgpt: true } }).shieldMode.gemini === undefined);

/* ------------------------------------------------ sanitization ----------- */
{
  const dirty = sanitizePatch({ shieldMode: { chatgpt: 1, claude: 0, 'evil.example': 'yes' } });
  ok('sanitize: shieldMode coerces to bool', dirty.shieldMode.chatgpt === true && dirty.shieldMode.claude === false && dirty.shieldMode['evil.example'] === true);
  const cap = {};
  for (let i = 0; i < 150; i++) cap['h' + i + '.example'] = true;
  ok('sanitize: caps map size at 100', Object.keys(sanitizePatch({ shieldMode: cap }).shieldMode).length === 100);
  const longKey = { ['a'.repeat(300) + '.example']: true, 'ok.example': true };
  ok('sanitize: drops over-long keys', !(('a'.repeat(300) + '.example') in sanitizePatch({ perSiteNoticeSeen: longKey }).perSiteNoticeSeen));
}

/* ------------------------------------------------ SW relay --------------- */
function drive(msg, sender) {
  tabsSent.length = 0;
  let response;
  swListener(msg, sender, (r) => (response = r));
  return response;
}
{
  // Approved text from the iframe → relayed to the originating tab as INJECT.
  const resp = drive(
    { type: MSG.SHIELD_SUBMIT, text: 'safe message', redacted: false, send: true, nonce: 'abc' },
    { id: 'test-ext-id', tab: { id: 42 } }
  );
  ok('relay: SHIELD_SUBMIT acknowledged', resp && resp.ok === true);
  ok('relay: forwards to sender tab', tabsSent.length === 1 && tabsSent[0].tabId === 42);
  ok('relay: forwards as SHIELD_INJECT', tabsSent[0].msg.type === MSG.SHIELD_INJECT);
  ok('relay: carries text + send + nonce', tabsSent[0].msg.text === 'safe message' && tabsSent[0].msg.send === true && tabsSent[0].msg.nonce === 'abc');
}
{
  const resp = drive({ type: MSG.SHIELD_CANCEL, nonce: 'abc' }, { id: 'test-ext-id', tab: { id: 7 } });
  ok('relay: SHIELD_CANCEL forwarded', tabsSent.length === 1 && tabsSent[0].msg.type === MSG.SHIELD_CANCEL && resp.ok === true);
}
{
  // No sender.tab (e.g. not from a tab) → not relayed.
  drive({ type: MSG.SHIELD_SUBMIT, text: 'x', nonce: 'n' }, { id: 'test-ext-id' });
  ok('relay: ignored without sender.tab', tabsSent.length === 0);
}
{
  // Foreign sender id rejected before relay.
  const resp = drive({ type: MSG.SHIELD_SUBMIT, text: 'x', nonce: 'n' }, { id: 'someone-else', tab: { id: 1 } });
  ok('relay: foreign sender rejected', resp && resp.ok === false && tabsSent.length === 0);
}
{
  // send:false still injects (insert without sending).
  drive({ type: MSG.SHIELD_SUBMIT, text: 'draft', send: false, nonce: 'z' }, { id: 'test-ext-id', tab: { id: 9 } });
  ok('relay: insert-without-send forwarded with send=false', tabsSent[0].msg.send === false);
}
{
  // Height report relayed as a sanitized number — never any content.
  const resp = drive({ type: MSG.SHIELD_RESIZE, height: 312.7, nonce: 'r1' }, { id: 'test-ext-id', tab: { id: 5 } });
  ok('relay: SHIELD_RESIZE forwarded', resp.ok === true && tabsSent.length === 1 && tabsSent[0].msg.type === MSG.SHIELD_RESIZE);
  ok('relay: SHIELD_RESIZE carries numeric height + nonce', tabsSent[0].msg.height === 312.7 && tabsSent[0].msg.nonce === 'r1');
  drive({ type: MSG.SHIELD_RESIZE, height: 'tall; <script>', nonce: 'r2' }, { id: 'test-ext-id', tab: { id: 5 } });
  ok('relay: SHIELD_RESIZE non-numeric height coerced to 0', tabsSent[0].msg.height === 0);
  drive({ type: MSG.SHIELD_RESIZE, height: -50, nonce: 'r3' }, { id: 'test-ext-id', tab: { id: 5 } });
  ok('relay: SHIELD_RESIZE negative height clamped to 0', tabsSent[0].msg.height === 0);
}

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All Shield Mode tests passed ✓');
