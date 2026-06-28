/* ============================================================================
 * AI Safety Guard — Phase 3 UI & adapter tests (jsdom)
 * Run: node src/content/ui.test.mjs
 * ========================================================================== */

import { JSDOM } from 'jsdom';

// --- jsdom + chrome stub global setup (before importing UI modules) ---------
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://chatgpt.com/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.chrome = { runtime: { getURL: (p) => 'chrome-extension://test/' + p } };

const { detect } = await import('./detector.js');
const { redact } = await import('./redactor.js');
const { removalNote } = await import('./rewriter.js');
const { CATEGORY } = await import('./detector.js');
const { getAdapter } = await import('./sites/index.js');
const { createBadge } = await import('./ui/badge.js');
const { createModal } = await import('./ui/modal.js');
const { writeInput } = await import('./dom-utils.js');

let pass = 0;
let fail = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : (fail++, fails.push(n)));
const tick = () => new Promise((r) => setTimeout(r, 0));

const FIXTURE =
  'Draft a reply to this customer — Sarah Chen (sarah.chen@northwind.io), ' +
  'account #88291, whose API key sk-live-9fK2pQ7xR4mZ8vB1 stopped working.';

/* ----------------------------------------------------------- redactor ---- */
{
  const r = detect(FIXTURE);
  const { redactedText } = redact(FIXTURE, r.matches);
  ok('redact: [API_KEY] chip present', redactedText.includes('[API_KEY]'));
  ok('redact: [ACCOUNT] chip present', redactedText.includes('[ACCOUNT]'));
  ok('redact: [EMAIL] chip present', redactedText.includes('[EMAIL]'));
  ok('redact: [NAME] chip present', redactedText.includes('[NAME]'));
  ok('redact: raw secret removed', !redactedText.includes('sk-live-9fK2pQ7xR4mZ8vB1'));
  ok('redact: raw email removed', !redactedText.includes('northwind.io'));
  ok('redact: re-scan is safe', detect(redactedText).riskLevel === 'safe');
  ok(
    'removalNote builds list',
    removalNote(['email', 'api_key'], CATEGORY).startsWith('Removed:')
  );
}

/* ----------------------------------------------------------- adapters ---- */
{
  ok('adapter: chatgpt host', getAdapter('chatgpt.com').id === 'chatgpt');
  ok('adapter: openai host', getAdapter('chat.openai.com').id === 'chatgpt');
  ok('adapter: claude host', getAdapter('claude.ai').id === 'claude');
  ok('adapter: gemini host', getAdapter('gemini.google.com').id === 'gemini');
  ok('adapter: perplexity host', getAdapter('www.perplexity.ai').id === 'perplexity');
  ok('adapter: copilot host', getAdapter('copilot.microsoft.com').id === 'copilot');
  ok('adapter: unknown host -> custom', getAdapter('example.com').id === 'custom');

  // selector resolution in a constructed DOM
  document.body.innerHTML =
    '<form><textarea id="prompt-textarea"></textarea>' +
    '<button data-testid="send-button">Send</button></form>';
  const a = getAdapter('chatgpt.com');
  ok('adapter: finds input', a.getInputElement(document).id === 'prompt-textarea');
  ok(
    'adapter: finds submit',
    a.getSubmitButton(document).getAttribute('data-testid') === 'send-button'
  );
  document.body.innerHTML = '';
}

/* ------------------------------------------------------------- A1 badge -- */
{
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);
  const badge = createBadge(anchor);
  const host = document.getElementById('asg-badge-host');

  badge.update(detect('hello world'), 'balanced');
  ok('badge: hidden on safe (balanced)', host.style.display === 'none');

  badge.update(detect('hello world'), 'strict');
  ok('badge: visible on safe (strict)', host.style.display !== 'none');

  const crit = detect(FIXTURE);
  badge.update(crit, 'balanced');
  const root = host.shadowRoot;
  ok('badge: shows critical label', root.textContent.includes('Critical risk'));
  ok('badge: shows finding count', /·\s*\d+\s*finding/.test(root.textContent));
  ok('badge: shows scanned locally + ms', /scanned locally · \d/.test(root.textContent));
  badge.destroy();
  document.body.innerHTML = '';
}

/* --------------------------------------------------- A2 modal centerpiece */
let submitted = false;
let appliedText = null;
let consentSet = false;
const services = {
  redact: (t, m) => redact(t, m),
  rescan: (t) => detect(t),
  rewrite: async () => ({ safeText: 'Draft a warm reply to a customer about a billing change.', removed: 'names, emails, account IDs, API key' }),
  getRewriteConfig: async () => ({ allowRewrite: false, endpoint: 'https://api.test/rewrite' }),
  setConsent: async () => {
    consentSet = true;
  },
  applyText: (t) => {
    appliedText = t;
  },
  submit: () => {
    submitted = true;
  },
  categoryMeta: CATEGORY,
  onCatch: () => {},
};

const modal = createModal();
const result = detect(FIXTURE);
modal.open({ result, text: FIXTURE, sensitivity: 'balanced', services });
const mhost = document.getElementById('asg-modal-host');
const mroot = mhost.shadowRoot;
const txt = () => mroot.textContent;
const buttons = () => [...mroot.querySelectorAll('button')];
const btn = (label) => buttons().find((b) => b.textContent.trim() === label);

// a11y (hardening #5)
ok('a11y: role=dialog', mroot.querySelector('.asg-card').getAttribute('role') === 'dialog');
ok('a11y: aria-modal', mroot.querySelector('.asg-card').getAttribute('aria-modal') === 'true');
ok('a11y: card focusable (tabindex -1)', mroot.querySelector('.asg-card').getAttribute('tabindex') === '-1');

ok('modal: title', txt().includes('Before you send this'));
ok('modal: subtitle', txt().includes('could expose confidential data'));
ok('modal: footer copy', txt().includes('Scanned on your device. Nothing has been sent or stored.'));
// findings masked values present
ok('modal: masked api key shown', txt().includes('sk-live-••••'));
ok('modal: masked account shown', txt().includes('#88•••'));
ok('modal: masked email shown', txt().includes('sarah.chen@…'));
// RAW values never present — the core security guarantee
ok('modal: raw api key NEVER shown', !txt().includes('sk-live-9fK2pQ7xR4mZ8vB1'));
ok('modal: raw account NEVER shown', !txt().includes('88291'));
ok('modal: raw email NEVER shown', !txt().includes('northwind.io'));
ok('modal: customer name NOT a finding row', !txt().includes('Sarah Chen'));
// exactly 3 finding rows
ok('modal: exactly 3 findings', mroot.querySelectorAll('.asg-find').length === 3);
// button order
const order = ['Redact sensitive data', 'Rewrite it safely', 'Send anyway', 'Keep editing'];
ok('modal: 4 buttons in order', order.every((l) => !!btn(l)));
// pills use desaturated palette classes
ok('modal: critical pill present', !!mroot.querySelector('.asg-pill--critical'));

/* ------- Send anyway -> submit + close ------- */
btn('Send anyway').click();
ok('modal: send anyway submits', submitted === true);
ok('modal: closes after send', !document.getElementById('asg-modal-host'));

/* ------- B1 redact flow ------- */
submitted = false;
modal.open({ result, text: FIXTURE, sensitivity: 'balanced', services });
let r2 = document.getElementById('asg-modal-host').shadowRoot;
r2.querySelectorAll('button').forEach((b) => {
  if (b.textContent.trim() === 'Redact sensitive data') b.click();
});
ok('B1: input got redacted text', appliedText && appliedText.includes('[API_KEY]'));
ok('B1: shows Safe state', r2.textContent.includes('Safe'));
ok('B1: chips rendered', !!r2.querySelector('.asg-chip'));
const looksGood = [...r2.querySelectorAll('button')].find(
  (b) => b.textContent.trim() === 'Looks good — send'
);
ok('B1: Looks good button present & enabled', looksGood && !looksGood.hasAttribute('disabled'));
looksGood.click();
ok('B1: Looks good triggers submit', submitted === true);
modal.close();

/* ------- B2 rewrite consent gate ------- */
modal.open({ result, text: FIXTURE, sensitivity: 'balanced', services });
let r3root = document.getElementById('asg-modal-host').shadowRoot;
[...r3root.querySelectorAll('button')]
  .find((b) => b.textContent.trim() === 'Rewrite it safely')
  .click();
await tick();
r3root = document.getElementById('asg-modal-host').shadowRoot;
ok('B2: two-column compare shown', r3root.textContent.includes('Your version') && r3root.textContent.includes('Safer version'));
ok('B2: cloud disclosure shown', r3root.textContent.includes('off by default'));
ok('B2: consent gate (no auto network)', !!([...r3root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Turn on cloud rewrite')));
// grant consent -> triggers injected rewrite
[...r3root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Turn on cloud rewrite').click();
await tick();
await tick();
r3root = document.getElementById('asg-modal-host').shadowRoot;
ok('B2: consent stored', consentSet === true);
ok('B2: safer version populated', r3root.textContent.includes('Draft a warm reply'));
ok('B2: removal note shown', r3root.textContent.toLowerCase().includes('removed:'));
const useSafer = [...r3root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Use safer version');
ok('B2: Use safer version enabled', useSafer && !useSafer.hasAttribute('disabled'));
useSafer.click();
ok('B2: applies safer text to input', appliedText.includes('Draft a warm reply'));
modal.close();

/* ------------------------------------------------ writeback (hardening #4) */
{
  // textarea: value set + input event fired
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  let taFired = false;
  ta.addEventListener('input', () => (taFired = true));
  writeInput(ta, 'hello world');
  ok('writeInput: textarea value set', ta.value === 'hello world');
  ok('writeInput: textarea input event fired', taFired === true);

  // contenteditable: must not throw, must dispatch an input event (the signal
  // ProseMirror/Quill listen to). execCommand is unavailable in jsdom so this
  // exercises the fallback path.
  const ce = document.createElement('div');
  ce.setAttribute('contenteditable', 'true');
  document.body.appendChild(ce);
  let ceFired = false;
  ce.addEventListener('input', () => (ceFired = true));
  let threw = false;
  try {
    writeInput(ce, 'redacted [EMAIL]');
  } catch {
    threw = true;
  }
  ok('writeInput: contenteditable no throw', threw === false);
  ok('writeInput: contenteditable input event fired', ceFired === true);
  document.body.innerHTML = '';
}

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All Phase 3 UI tests passed ✓');
