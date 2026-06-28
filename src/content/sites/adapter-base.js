/* ============================================================================
 * AI Safety Guard — Site adapter helpers
 * ----------------------------------------------------------------------------
 * AI sites change their DOM often. Each adapter declares a PRIMARY selector
 * plus FALLBACKS; firstMatch tries them in order and warns (once) when nothing
 * is found — that warning is the first thing to check when a site breaks.
 * ========================================================================== */

import { log } from '../../shared/log.js';

const warned = new Set();

export function firstMatch(selectors, what, siteId, doc = document) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  const key = `${siteId}:${what}`;
  if (!warned.has(key)) {
    warned.add(key);
    // Diagnostic only (gated, off in production). Submit handling has
    // selector-independent fallbacks (looksLikeSendButton + Enter/submit).
    log.debug(
      `${siteId}: could not find ${what} via selectors.`,
      `Tried: ${selectors.join(', ')}. Falling back to heuristics.`
    );
  }
  return null;
}

/**
 * Heuristic: does this element look like a "send/submit" control? Used so that
 * clicking the real send button is intercepted even when a site renames its
 * selectors (which they do often).
 */
export function looksLikeSendButton(el) {
  if (!el) return false;
  if (el.getAttribute && el.getAttribute('type') === 'submit') return true;
  const hay = [
    el.getAttribute && el.getAttribute('aria-label'),
    el.getAttribute && el.getAttribute('data-testid'),
    el.getAttribute && el.getAttribute('title'),
    el.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\bsend\b|\bsubmit\b|send-button|composer-submit/.test(hay);
}

/** Build a standard adapter from selector lists. */
export function makeAdapter({ id, input, submit, badgeAnchor }) {
  return {
    id,
    getInputElement: (doc = document) => firstMatch(input, 'input box', id, doc),
    getSubmitButton: (doc = document) => firstMatch(submit, 'submit button', id, doc),
    getBadgeAnchor: (doc = document) =>
      firstMatch(badgeAnchor || input, 'badge anchor', id, doc),
  };
}
