/* ============================================================================
 * AI Safety Guard — Shield Mode overlay (content-script side)
 * ----------------------------------------------------------------------------
 * When Shield Mode is ON for a site, this positions an extension-origin iframe
 * (the secure composer) directly over the provider's real composer. The user
 * types inside the iframe — the provider's page scripts cannot read it. On
 * approval, the secure composer sends the approved text to the service worker,
 * which relays it here (SHIELD_INJECT); we write it into the real composer with
 * the existing writeInput() and optionally trigger the site's send.
 *
 * Boundary summary: raw text lives only in the iframe (extension origin).
 * Approved text reaches this content script via the SW relay — never through
 * the provider page's window. It touches the provider only at writeInput().
 * ========================================================================== */

import { writeInput } from '../dom-utils.js';
import { MSG } from '../../shared/storage.js';
import { log } from '../../shared/log.js';

const IFRAME_ID = 'asg-shield-frame';
const EXT_ORIGIN = (() => {
  try {
    return chrome.runtime.getURL('').replace(/\/$/, '');
  } catch {
    return '';
  }
})();

function randomNonce() {
  const a = new Uint8Array(16);
  (crypto || {}).getRandomValues?.(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createShieldOverlay({ getComposer, getSubmitButton, doSubmit, settingsRef }) {
  let frame = null;
  let nonce = '';
  let active = false;
  let relayHandler = null;
  let resizeObserver = null;
  let repositionTimer = null;
  // Guards the close() → composer.focus() → focusin → open() loop: without it
  // the overlay reopens the instant it closes (and open()'s writeInput('') can
  // wipe just-injected text before doSubmit fires).
  let suppressOpenUntil = 0;

  // The secure composer needs room for its header, findings list and action
  // bar even when the underlying composer has collapsed to a single row.
  const MIN_HEIGHT = 220;
  // Height the secure composer reported it needs for its current content
  // (SHIELD_RESIZE relay). 0 = no report yet.
  let contentHeight = 0;

  function positionOver(el) {
    if (!frame || !el) return;
    const r = el.getBoundingClientRect();
    // Cover the composer; grow with the iframe's reported content needs so the
    // typed text and findings stay readable (fixed positioning, viewport coords).
    const desired = Math.max(Math.max(r.height, 44) + 96, contentHeight);
    const height = Math.max(MIN_HEIGHT, Math.min(desired, window.innerHeight - 16));
    // Keep the frame fully on-screen: when the composer sits near the bottom
    // of the viewport (in-conversation layout), extend upward instead of
    // getting squashed against the bottom edge.
    const top = Math.max(8, Math.min(r.top, window.innerHeight - height - 8));
    Object.assign(frame.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: top + 'px',
      width: r.width + 'px',
      height: height + 'px',
      zIndex: '2147483646',
      border: '0',
      colorScheme: 'normal',
    });
  }

  function open() {
    const composer = getComposer();
    if (!composer || active) return;
    active = true;
    nonce = randomNonce();

    const muted = (settingsRef().disabledCategories || []).join(',');
    const s = settingsRef().sensitivity || 'balanced';
    frame = document.createElement('iframe');
    frame.id = IFRAME_ID;
    frame.setAttribute('title', 'AI Safety Guard secure composer');
    frame.setAttribute('allow', ''); // no powerful features
    frame.src = chrome.runtime.getURL(
      `src/secure-composer/secure-composer.html?n=${nonce}&s=${encodeURIComponent(s)}&m=${encodeURIComponent(muted)}`
    );
    positionOver(composer);
    document.documentElement.appendChild(frame);

    // Clear any text that raced into the real composer before the overlay came
    // up, so nothing typed under Shield Mode is left exposed behind us. Then
    // blur it immediately: writeInput focuses the composer, but we want focus
    // to move to the iframe (which focuses itself on load) — blurring closes
    // the window in which a keystroke could still land in the provider box.
    try {
      writeInput(composer, '');
      if (typeof composer.blur === 'function') composer.blur();
    } catch {
      /* ignore */
    }

    window.addEventListener('resize', reposition, true);
    window.addEventListener('scroll', reposition, true);
    // Follow composer size changes (multi-line growth, post-send collapse)…
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(reposition);
      resizeObserver.observe(composer);
    }
    // …and position changes from SPA layout shifts, which fire neither
    // resize nor scroll (messages streaming in above the composer).
    repositionTimer = setInterval(reposition, 300);
  }

  function reposition() {
    if (active) positionOver(getComposer());
  }

  function close({ refocus = true } = {}) {
    if (!active) return;
    active = false;
    window.removeEventListener('resize', reposition, true);
    window.removeEventListener('scroll', reposition, true);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (repositionTimer) {
      clearInterval(repositionTimer);
      repositionTimer = null;
    }
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    frame = null;
    nonce = '';
    contentHeight = 0;
    // Refocusing the composer fires focusin — suppress the reopen it would
    // otherwise trigger, so the shield doesn't flash back up (or wipe text
    // we just injected).
    suppressOpenUntil = Date.now() + 400;
    if (refocus) {
      // Return focus to the real composer so the user can keep working.
      const c = getComposer();
      if (c && typeof c.focus === 'function') c.focus();
    }
  }

  // Approved text arrives from the SW relay (SHIELD_INJECT). Validate the nonce.
  function handleRelay(msg) {
    if (!active || !msg || msg.nonce !== nonce) return;
    if (msg.type === MSG.SHIELD_RESIZE) {
      contentHeight = Math.max(0, Number(msg.height) || 0);
      reposition();
      return;
    }
    if (msg.type === MSG.SHIELD_CANCEL) {
      close();
      return;
    }
    if (msg.type === MSG.SHIELD_INJECT) {
      const composer = getComposer();
      if (composer) {
        writeInput(composer, String(msg.text || ''));
        if (msg.send) {
          // Let the site's framework register the value, then submit.
          setTimeout(() => {
            try {
              doSubmit ? doSubmit() : (getSubmitButton() && getSubmitButton().click());
            } catch {
              /* ignore */
            }
          }, 30);
        }
      }
      // On send, leave focus where the site puts it (refocusing mid-submit
      // can steal focus from the streaming response or reopen the shield).
      close({ refocus: !msg.send });
    }
  }

  // Focus handoff: when Shield is on and the user focuses the REAL composer,
  // open the secure overlay before they can type into the provider box.
  function onFocusIn(e) {
    if (!shieldEnabled()) return;
    if (Date.now() < suppressOpenUntil) return; // programmatic refocus from close()
    const composer = getComposer();
    if (!composer) return;
    if (e.target === composer || (composer.contains && composer.contains(e.target))) {
      open();
    }
  }

  // Focus can already be inside the composer when Shield turns on, or after a
  // suppressed refocus — then no focusin edge ever fires and keystrokes would
  // land in the provider box. Catch the first keystroke and raise the shield.
  function onKeyDown(e) {
    if (active || !shieldEnabled()) return;
    if (Date.now() < suppressOpenUntil) return;
    const composer = getComposer();
    if (!composer) return;
    if (e.target === composer || (composer.contains && composer.contains(e.target))) {
      open();
    }
  }

  function shieldEnabled() {
    const s = settingsRef();
    // Resolved per active site by the caller via settingsRef().__shieldOn.
    return !!s.__shieldOn;
  }

  function attach() {
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('keydown', onKeyDown, true);
    relayHandler = (msg) => handleRelay(msg);
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (
          msg &&
          (msg.type === MSG.SHIELD_INJECT || msg.type === MSG.SHIELD_CANCEL || msg.type === MSG.SHIELD_RESIZE)
        ) {
          relayHandler(msg);
        }
      });
    } catch {
      log.warn('shield: runtime messaging unavailable');
    }
  }

  return { attach, open, close, isActive: () => active, EXT_ORIGIN };
}
