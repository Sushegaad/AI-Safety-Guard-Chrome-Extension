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

import { DEFAULT_REWRITE_ENDPOINT } from '../shared/constants.js';
import { detect, CATEGORY } from './detector.js';
export { DEFAULT_REWRITE_ENDPOINT };
export const REWRITE_INSTRUCTION = 'Remove or generalize all sensitive details';

// Generic descriptors used by the on-device rewrite fallback.
const GENERIC = {
  api_key: 'an API key',
  password: 'a password',
  credit_card: 'a card number',
  ssn: 'an SSN',
  account_number: 'an account number',
  email: 'an email address',
  phone: 'a phone number',
  address: 'an address',
  health: 'health information',
  financial: 'financial details',
  legal: 'confidential information',
  customer_data: "a person's name",
  internal_url: 'an internal URL',
  source_code: 'some code',
};

/**
 * On-device "safer version": replace each detected sensitive value with a
 * generic descriptor. No network, no LLM. This is the default rewrite so the
 * feature works out of the box without a backend, and is also the fallback if a
 * configured cloud endpoint is unreachable.
 *
 * @param {string} prompt
 * @returns {{ safeText: string, removed: string }}
 */
export function localRewrite(prompt) {
  const text = String(prompt || '');
  const { matches } = detect(text);
  const ordered = [...matches]
    .filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start)
    .sort((a, b) => b.start - a.start);

  let out = text;
  let last = Infinity;
  for (const m of ordered) {
    if (m.end > last) continue; // skip overlaps
    out = out.slice(0, m.start) + (GENERIC[m.category] || 'sensitive information') + out.slice(m.end);
    last = m.start;
  }

  const seen = new Set();
  const removed = matches
    .filter((m) => m.showInModal !== false)
    .filter((m) => (seen.has(m.category) ? false : (seen.add(m.category), true)))
    .map((m) => CATEGORY[m.category].summary)
    .join(', ');

  return { safeText: out, removed };
}

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
