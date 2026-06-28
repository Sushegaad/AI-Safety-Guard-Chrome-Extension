/* ============================================================================
 * AI Safety Guard — Content Script (orchestration)
 * ----------------------------------------------------------------------------
 * Wires the on-device detector to the UI on supported AI sites:
 *   - resolve the site adapter (DOM selectors)
 *   - MutationObserver re-attaches across SPA navigation
 *   - debounced scan drives the inline badge (A1)
 *   - capture-phase submit interception opens the warning modal (A2 → B1 redact)
 *
 * Settings are read through the service worker. Everything is on-device: there
 * is no network call and nothing the user types ever leaves the browser.
 * ========================================================================== */

import { detect, detectAsync, ASYNC_THRESHOLD } from './detector.js';
import { redact } from './redactor.js';
import { readInput, writeInput } from './dom-utils.js';
import { getAdapter } from './sites/index.js';
import { looksLikeSendButton } from './sites/adapter-base.js';
import { createBadge } from './ui/badge.js';
import { createModal } from './ui/modal.js';
import { loadFonts } from './ui/fonts.js';
import { initAttachWatcher } from './files/attach.js';
import { extractText } from './files/extract.js';
import { debounce } from '../shared/debounce.js';
import { shouldInterrupt } from '../shared/constants.js';
import { MSG, withDefaults } from '../shared/storage.js';

// Lazy chunks (the pdf.js parser) must load from the extension origin, not the
// host page. Set webpack's runtime public path before any dynamic import().
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  __webpack_public_path__ = chrome.runtime.getURL('');
}

const settings = withDefaults({});

const adapter = getAdapter();
const modal = createModal();

let inputEl = null;
let badge = null;
let boundInput = null;
let boundInputListener = null;

// Time-boxed suppression: when WE programmatically trigger a send, allow exactly
// the next submit within a short window, then auto-expire. Safer than a sticky
// boolean — a stale flag can never linger to leak a later genuine send.
let suppressUntil = 0;
const nowMs = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
function consumeSuppression() {
  if (nowMs() < suppressUntil) {
    suppressUntil = 0;
    return true;
  }
  return false;
}

/* ------------------------------- settings -------------------------------- */
// The service worker owns storage; content scripts ask for settings by message.
async function loadSettings() {
  try {
    const s = await chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    if (s && typeof s === 'object' && !s.error) Object.assign(settings, withDefaults(s));
  } catch {
    /* defaults stand */
  }
}
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === MSG.SETTINGS_UPDATED && msg.settings) {
      Object.assign(settings, withDefaults(msg.settings));
    }
  });
} catch {
  /* no chrome in some contexts */
}

// Is the extension active for this tab's site?
function siteEnabled() {
  if (!settings.enabled) return false;
  if (adapter.id === 'custom') {
    const host = location.hostname;
    return (settings.customDomains || []).some((d) => host === d || host.endsWith('.' + d));
  }
  return settings.enabledSites[adapter.id] !== false;
}

/* -------------------------------- scanning ------------------------------- */
function applyResult(result) {
  if (badge) badge.update(result, settings.sensitivity);
}

function runScan() {
  if (!inputEl) return;
  if (!siteEnabled()) {
    if (badge) badge.hide();
    return;
  }
  const text = readInput(inputEl);
  if (!text) {
    if (badge) badge.hide();
    return;
  }
  if (text.length > ASYNC_THRESHOLD) {
    detectAsync(text).then(applyResult);
  } else {
    applyResult(detect(text));
  }
}
const scheduleScan = debounce(runScan, 300);

/* ------------------------- submit interception --------------------------- */
function evaluateSubmit(e) {
  if (!inputEl || !siteEnabled()) return;
  if (consumeSuppression()) return; // user already chose to send
  const text = readInput(inputEl);
  if (!text) return;
  const result = detect(text);
  const interrupts =
    shouldInterrupt(result.riskLevel, settings.sensitivity) &&
    result.matches.some((m) => m.showInModal);
  if (!interrupts) return;

  e.preventDefault();
  e.stopPropagation();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  openModal(result, text);
}

function doSubmit() {
  const btn = adapter.getSubmitButton();
  if (btn) {
    btn.click();
  } else if (inputEl) {
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  }
}

function openModal(result, text) {
  modal.open({
    result,
    text,
    sensitivity: settings.sensitivity,
    services: {
      redact: (t, matches) => redact(t, matches),
      rescan: (t) => detect(t),
      applyText: (t) => writeInput(inputEl, t),
      submit: () => {
        suppressUntil = nowMs() + 400; // allow exactly the send we trigger next
        doSubmit();
      },
      onCatch: () => {
        try {
          chrome.runtime.sendMessage({ type: MSG.RECORD_CATCH });
        } catch {
          /* ignore */
        }
      },
    },
  });
}

// Document-level capture listeners (attached once). Capture phase fires before
// the site's own bubble-phase handlers, so we can stop the send in time.
function attachInterceptors() {
  document.addEventListener(
    'click',
    (e) => {
      if (!inputEl) return;
      const clicked = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
      if (!clicked) return;
      // Intercept if it is the known submit button OR just looks like a send
      // control (robust to the site renaming its selectors).
      if (clicked === adapter.getSubmitButton() || looksLikeSendButton(clicked)) {
        evaluateSubmit(e);
      }
    },
    true
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // Skip Enter that commits an IME composition (CJK input, etc.).
      if (e.isComposing || e.keyCode === 229) return;
      if (inputEl && (e.target === inputEl || inputEl.contains(e.target))) {
        evaluateSubmit(e); // covers bare Enter and Cmd/Ctrl+Enter
      }
    },
    true
  );
  // Native form submission (some sites submit the <form>, not a button click).
  document.addEventListener(
    'submit',
    (e) => {
      if (inputEl && e.target && typeof e.target.contains === 'function' && e.target.contains(inputEl)) {
        evaluateSubmit(e);
      }
    },
    true
  );
}

/* ------------------------------- attaching ------------------------------- */
function attach() {
  const el = adapter.getInputElement();
  if (!el) return;
  if (el === boundInput && document.contains(el)) return; // already bound & alive

  // (Re)bind to a new input element (SPA navigation or first load).
  if (badge) {
    badge.destroy();
    badge = null;
  }
  // Remove the input listener from the previously bound element (prevents
  // leaks/duplicate scans when a site pools/reuses editor nodes).
  if (boundInput && boundInputListener) {
    boundInput.removeEventListener('input', boundInputListener);
  }
  inputEl = el;
  boundInput = el;
  boundInputListener = scheduleScan;
  const anchor = adapter.getBadgeAnchor() || el;
  badge = createBadge(anchor);
  el.addEventListener('input', boundInputListener);
  runScan();
}

/* ----------------------- file attachment scanning ----------------------- */
function fileScanEnabled() {
  return siteEnabled() && settings.scanAttachments !== false;
}

async function onAttach(files) {
  const first = files.find((f) => f && f.name);
  const count = files.length;
  // Tier 0: immediate, non-blocking nudge.
  modal.openFile({
    title: 'Check this file before sending',
    subtitle:
      `You're attaching ${count > 1 ? count + ' files' : 'a file'}` +
      (first ? ` ("${first.name}")` : '') +
      `. Files can carry personal data this scanner can't see in the chat box. Review before sending.`,
  });

  // Tier 1: extract text on-device and scan it. Escalate if PII is found.
  for (const f of files) {
    let res;
    try {
      res = await extractText(f);
    } catch {
      continue;
    }
    if (!res || !res.supported || res.error || !res.text) continue;
    const result = detect(res.text);
    const findings = result.matches.filter((m) => m.showInModal);
    if (findings.length && shouldInterrupt(result.riskLevel, settings.sensitivity)) {
      modal.openFile({
        title: 'This file may contain private data',
        subtitle: `"${f.name}" looks like it includes the items below. Remove it or review before sending to an AI tool.`,
        findings: result.matches,
      });
      try {
        chrome.runtime.sendMessage({ type: MSG.RECORD_CATCH });
      } catch {
        /* ignore */
      }
      break; // one findings warning is enough
    }
  }
}

function start() {
  loadFonts(); // register embedded fonts CSP-safely (async, fire-and-forget)
  attachInterceptors();
  initAttachWatcher(onAttach, fileScanEnabled);
  attach();
  // SPA pages mutate the DOM continuously while streaming answers — debounce the
  // re-attach check so we don't run it on every mutation batch.
  const recheck = debounce(() => {
    if (!inputEl || !document.contains(inputEl)) attach();
  }, 250);
  const observer = new MutationObserver(recheck);
  observer.observe(document.body, { childList: true, subtree: true });
}

loadSettings().finally(() => {
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
});
