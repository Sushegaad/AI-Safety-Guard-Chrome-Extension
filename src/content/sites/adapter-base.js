/* ============================================================================
 * AI Safety Guard — Site adapter helpers
 * ----------------------------------------------------------------------------
 * AI sites change their DOM often. Each adapter declares a PRIMARY selector
 * plus FALLBACKS; firstMatch tries them in order and warns (once) when nothing
 * is found — that warning is the first thing to check when a site breaks.
 * ========================================================================== */

const warned = new Set();

export function firstMatch(selectors, what, siteId, doc = document) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  const key = `${siteId}:${what}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(
      `[AI Safety Guard] ${siteId}: could not find ${what}. ` +
        `Tried: ${selectors.join(', ')}. The site's DOM may have changed.`
    );
  }
  return null;
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
