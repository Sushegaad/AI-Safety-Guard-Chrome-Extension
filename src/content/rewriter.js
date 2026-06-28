/* ============================================================================
 * AI Safety Guard — Safe Rewrite (B2 support) — THE ONLY CLOUD STEP
 * ----------------------------------------------------------------------------
 * This is the single feature that sends text off-device, and only when the user
 * explicitly asks for it AND has granted consent. Everything else is local.
 *
 * Request payload (per PRD §11 / Implementation Plan §3.4):
 *   { prompt, categories, instruction: "Remove or generalize all sensitive details" }
 * Response (expected):
 *   { safeText, removed }   // removed = human list e.g. "names, emails, account IDs"
 * ========================================================================== */

export const DEFAULT_REWRITE_ENDPOINT = 'https://api.aisafetyguard.app/v1/rewrite';
export const REWRITE_INSTRUCTION = 'Remove or generalize all sensitive details';

/**
 * Call the configured rewrite endpoint. NEVER call this without prior consent —
 * the caller (B2 panel) gates on chrome.storage `allowRewrite`.
 *
 * @param {string} prompt
 * @param {string[]} categories  detected category ids
 * @param {object} [opts]
 * @param {string} [opts.endpoint]
 * @param {function} [opts.fetchImpl]  injectable for testing
 * @returns {Promise<{ safeText: string, removed: string }>}
 */
export async function rewrite(prompt, categories, opts = {}) {
  const endpoint = opts.endpoint || DEFAULT_REWRITE_ENDPOINT;
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) throw new Error('No fetch implementation available');

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, categories, instruction: REWRITE_INSTRUCTION }),
  });
  if (!res.ok) throw new Error(`Rewrite endpoint returned ${res.status}`);
  const data = await res.json();
  return {
    safeText: data.safeText || data.rewritten || '',
    removed: data.removed || '',
  };
}

/** Build the human-readable "Removed: ..." note from detected categories. */
export function removalNote(categories, categoryMeta) {
  const labels = categories
    .map((c) => (categoryMeta[c] ? categoryMeta[c].summary : c))
    .filter(Boolean);
  return labels.length ? `Removed: ${labels.join(', ')}` : '';
}
