/* ============================================================================
 * AI Safety Guard — Redactor (B1 support)
 * ----------------------------------------------------------------------------
 * Pure text transform: replace every detected raw value with its [TYPE] label.
 * Replacement runs right-to-left (highest start index first) so earlier offsets
 * stay valid as the string is rewritten.
 *
 * Label format matches the design exactly:
 *   Sarah Chen            -> [NAME]
 *   sarah.chen@x.io       -> [EMAIL]
 *   #88291                -> [ACCOUNT]
 *   sk-live-9fK2...       -> [API_KEY]
 *   4111-1111-1111-1111   -> [CARD]
 *   123-45-6789           -> [SSN]
 *   555-867-5309          -> [PHONE]
 * ========================================================================== */

import { CATEGORY } from './detector.js';

/**
 * @param {string} text     original prompt
 * @param {Match[]} matches detector matches (with start/end/category)
 * @returns {{ redactedText: string, labels: string[] }}
 */
export function redact(text, matches) {
  if (!text || !matches || matches.length === 0) {
    return { redactedText: text || '', labels: [] };
  }
  // Sort by start descending; drop overlaps (keep the earliest-started, longest).
  const ordered = [...matches]
    .filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start)
    .sort((a, b) => b.start - a.start);

  let out = text;
  const labels = [];
  let lastStart = Infinity;
  for (const m of ordered) {
    if (m.end > lastStart) continue; // overlaps a replacement we already made
    const label = (CATEGORY[m.category] && CATEGORY[m.category].redactLabel) || '[REDACTED]';
    out = out.slice(0, m.start) + label + out.slice(m.end);
    labels.push(label);
    lastStart = m.start;
  }
  labels.reverse();
  return { redactedText: out, labels };
}
