/* ============================================================================
 * AI Safety Guard — Secure Composer logic (Shield Mode iframe)
 * ----------------------------------------------------------------------------
 * Runs INSIDE the extension-origin iframe. The provider page cannot read this
 * document. Responsibilities:
 *   - live on-device scan of what the user types/pastes (reuse detect())
 *   - show masked findings + a risk pill (never raw values)
 *   - on approve: optionally redact, then send the approved text to the service
 *     worker (chrome.runtime), which relays it to the content script. The raw
 *     pre-approval text NEVER leaves this iframe.
 *
 * A per-session nonce (from the ?n= query param set by the content script when
 * it created the iframe) tags every message so the relay can be correlated and
 * spoofed messages ignored.
 * ========================================================================== */

import { detect } from '../content/detector.js';
import { redact } from '../content/redactor.js';
import { CATEGORY } from '../content/detector.js';
import { RISK, shouldInterrupt } from '../shared/constants.js';
import { MSG } from '../shared/storage.js';
import { debounce } from '../shared/debounce.js';

const params = new URLSearchParams(location.search);
const NONCE = params.get('n') || '';
const SENSITIVITY = params.get('s') || 'balanced';
// Muted categories passed by the content script (comma-separated ids).
const MUTED = (params.get('m') || '').split(',').filter(Boolean);

const input = document.getElementById('sc-input');
const findingsEl = document.getElementById('sc-findings');
const sendBtn = document.getElementById('sc-send');
const insertBtn = document.getElementById('sc-insert');
const cancelBtn = document.getElementById('sc-cancel');

let lastResult = { riskLevel: 'safe', matches: [] };

function readText() {
  return input.innerText || '';
}

function applyMutes(result) {
  if (!MUTED.length) return result;
  const muted = new Set(MUTED);
  const matches = result.matches.filter((m) => !muted.has(m.category));
  return { ...result, matches };
}

function renderFindings(result) {
  const shown = result.matches.filter((m) => m.showInModal);
  if (!shown.length) {
    findingsEl.hidden = true;
    findingsEl.textContent = '';
    return;
  }
  findingsEl.hidden = false;
  findingsEl.textContent = '';
  const seen = new Set();
  for (const m of shown) {
    if (seen.has(m.category)) continue;
    seen.add(m.category);
    const row = document.createElement('div');
    row.className = 'sc__find';
    row.setAttribute('role', 'listitem');
    const type = document.createElement('span');
    type.className = 'sc__find-type';
    type.textContent = m.type;
    const val = document.createElement('span');
    val.className = 'sc__find-val asg-data';
    val.textContent = m.maskedValue; // masked only — never raw
    const pill = document.createElement('span');
    pill.className = 'sc__pill sc__pill--' + m.risk;
    pill.textContent = RISK[m.risk].pillLabel;
    row.append(type, val, pill);
    findingsEl.appendChild(row);
  }
}

/* ------------------------------ height report ----------------------------- */
// Tell the content script how tall this frame needs to be so the typed text
// and findings stay readable. A px number only — never content (the relay is
// nonce-tagged like every other shield message).
const barEl = document.querySelector('.sc__bar');
const actionsEl = document.querySelector('.sc__actions');
let lastReportedHeight = 0;

function reportHeight() {
  const findingsH = findingsEl.hidden ? 0 : Math.min(findingsEl.scrollHeight, 240);
  const inputH = Math.min(Math.max(input.scrollHeight, 88), 420);
  const needed = Math.ceil(barEl.offsetHeight + inputH + findingsH + actionsEl.offsetHeight + 8);
  if (Math.abs(needed - lastReportedHeight) < 8) return; // ignore sub-pixel churn
  lastReportedHeight = needed;
  post(MSG.SHIELD_RESIZE, { height: needed });
}

function scan() {
  const result = applyMutes(detect(readText()));
  lastResult = result;
  renderFindings(result);
  reportHeight();
  const risky =
    shouldInterrupt(result.riskLevel, SENSITIVITY) &&
    result.matches.some((m) => m.showInModal && CATEGORY[m.category].interrupt !== false);
  // Reflect risk on the primary button so the user knows a plain send would
  // carry sensitive data (they can still redact or send anyway).
  sendBtn.dataset.risk = risky ? result.riskLevel : 'safe';
  sendBtn.textContent = risky ? 'Redact & send safely' : 'Insert & send';
}

const scheduleScan = debounce(scan, 200);
input.addEventListener('input', scheduleScan);

/* --------------------------------- actions ------------------------------- */
function submit(send) {
  const text = readText();
  if (!text.trim()) {
    cancel();
    return;
  }
  const risky = sendBtn.dataset.risk && sendBtn.dataset.risk !== 'safe';
  // If the send button is in "redact" state, redact before injecting.
  const outText = risky ? redact(text, lastResult.matches).redactedText : text;
  post(MSG.SHIELD_SUBMIT, { text: outText, redacted: risky, send: !!send });
}

function cancel() {
  post(MSG.SHIELD_CANCEL, {});
}

function post(type, extra) {
  try {
    chrome.runtime.sendMessage({ type, nonce: NONCE, ...extra });
  } catch {
    /* the content script also has a timeout fallback */
  }
}

sendBtn.addEventListener('click', () => submit(true));
insertBtn.addEventListener('click', () => submit(false));
cancelBtn.addEventListener('click', cancel);

// Keyboard parity with the real composer: Enter = insert & send, Shift+Enter =
// newline, Esc = cancel (keep the draft in place by cancelling, not clearing).
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit(true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
});

// Note: we deliberately do NOT seed the iframe with pre-existing provider-box
// text. The iframe src (with its query params) is readable by the provider
// page via the DOM, so nothing sensitive may travel in the URL. Shield Mode
// starts fresh; any text already in the provider box was, by definition,
// already exposed to it.

// Focus immediately so typing lands here, not in the provider box behind us.
input.focus();

// Report the initial height once layout (incl. fonts) has settled.
requestAnimationFrame(reportHeight);
