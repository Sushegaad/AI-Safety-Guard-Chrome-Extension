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

  function positionOver(el) {
    if (!frame || !el) return;
    const r = el.getBoundingClientRect();
    // Cover the composer; grow a little downward for the action bar without
    // pushing the page around (fixed positioning, viewport coords).
    const height = Math.max(r.height, 44) + 96;
    Object.assign(frame.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: Math.min(height, window.innerHeight - r.top - 8) + 'px',
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
  }

  function reposition() {
    if (active) positionOver(getComposer());
  }

  function close() {
    if (!active) return;
    active = false;
    window.removeEventListener('resize', reposition, true);
    window.removeEventListener('scroll', reposition, true);
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    frame = null;
    nonce = '';
    // Return focus to the real composer so the user can keep working.
    const c = getComposer();
    if (c && typeof c.focus === 'function') c.focus();
  }

  // Approved text arrives from the SW relay (SHIELD_INJECT). Validate the nonce.
  function handleRelay(msg) {
    if (!active || !msg || msg.nonce !== nonce) return;
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
      close();
    }
  }

  // Focus handoff: when Shield is on and the user focuses the REAL composer,
  // open the secure overlay before they can type into the provider box.
  function onFocusIn(e) {
    if (!shieldEnabled()) return;
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
    relayHandler = (msg) => handleRelay(msg);
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && (msg.type === MSG.SHIELD_INJECT || msg.type === MSG.SHIELD_CANCEL)) {
          relayHandler(msg);
        }
      });
    } catch {
      log.warn('shield: runtime messaging unavailable');
    }
  }

  return { attach, open, close, isActive: () => active, EXT_ORIGIN };
}
