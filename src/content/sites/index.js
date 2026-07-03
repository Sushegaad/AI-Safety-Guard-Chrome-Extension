/* ============================================================================
 * AI Safety Guard — Site adapter dispatcher
 * ----------------------------------------------------------------------------
 * Builds one adapter per registry entry (shared/sites.js) and resolves the
 * adapter for the current hostname. Custom domains added by the user fall back
 * to a generic adapter.
 * ========================================================================== */

import { makeAdapter } from './adapter-base.js';
import { SITES, siteForHost } from '../../shared/sites.js';

/* Generic adapter for user-added custom domains (best-effort, labelled
 * "experimental" in the popup). Input = the LARGEST visible composer candidate
 * on the page — unknown chat UIs usually have one dominant prompt box, and
 * "first match" would grab a search field or hidden template instead. */
const GENERIC_INPUT_SELECTOR = 'textarea, div[contenteditable="true"]';

function largestVisibleInput(doc = document) {
  const candidates = [...doc.querySelectorAll(GENERIC_INPUT_SELECTOR)];
  if (!candidates.length) return null;
  let best = null;
  let bestArea = 0;
  for (const el of candidates) {
    const r = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const area = r ? r.width * r.height : 0;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  // Nothing measurable (all zero-sized — or a non-visual test DOM): fall back
  // to the first candidate rather than reporting no input at all.
  return best || candidates[0];
}

const genericBase = makeAdapter({
  id: 'custom',
  input: [GENERIC_INPUT_SELECTOR],
  submit: ['button[type="submit"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]'],
});

const generic = {
  ...genericBase,
  getInputElement: (doc = document) => largestVisibleInput(doc),
  getBadgeAnchor: (doc = document) => largestVisibleInput(doc), // anchor = the input itself
};

/** The generic adapter, exported for degraded-mode fallback (content.js). */
export const genericAdapter = generic;

// One adapter per registry site, keyed by id.
export const ADAPTERS = Object.fromEntries(
  SITES.map((s) => [
    s.id,
    makeAdapter({
      id: s.id,
      input: s.selectors.input,
      submit: s.selectors.submit,
      badgeAnchor: s.selectors.badgeAnchor,
    }),
  ])
);

/** Resolve the adapter for a hostname (default: current location host). */
export function getAdapter(host = location.hostname) {
  const site = siteForHost(host);
  return site ? ADAPTERS[site.id] : generic;
}
