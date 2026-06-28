/* ============================================================================
 * AI Safety Guard — DOCX text extraction (on-device)
 * ----------------------------------------------------------------------------
 * A .docx is a ZIP of XML parts. We unzip in the browser (fflate, a few KB) and
 * pull text from the body AND the places PII likes to hide: comments, tracked
 * changes (kept automatically since the text lives in <w:t> nodes), headers,
 * footers, footnotes/endnotes, and document properties (author, title, etc.).
 * Pure function — no network, no DOM.
 * ========================================================================== */

import { unzipSync, strFromU8 } from 'fflate';

// XML parts whose text we extract. Anything under word/ or docProps/ that is XML.
const PART_RE = /^(word\/.*\.xml|docProps\/.*\.xml)$/;

export function extractDocxText(uint8) {
  let files;
  try {
    files = unzipSync(uint8);
  } catch {
    return ''; // not a valid zip / corrupt
  }
  let xml = '';
  for (const name of Object.keys(files)) {
    if (!PART_RE.test(name)) continue;
    try {
      xml += ' ' + strFromU8(files[name]);
    } catch {
      /* skip unreadable part */
    }
  }
  return xmlToText(xml);
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, ' ')
    .replace(/<w:br\b[^>]*\/?>/g, ' ')
    .replace(/<\/w:p>/g, ' ')
    .replace(/<[^>]+>/g, ' ') // strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
