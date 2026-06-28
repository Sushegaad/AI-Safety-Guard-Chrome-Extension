/* ============================================================================
 * AI Safety Guard — File text extraction dispatcher (on-device)
 * ----------------------------------------------------------------------------
 * Maps a File to text by type. DOCX is parsed inline (fflate is tiny); PDF is
 * lazy-imported so the heavy pdf.js code only loads when a PDF is attached.
 * Unsupported types return supported:false so the Tier 0 nudge still applies.
 * ========================================================================== */

import { extractDocxText } from './docx.js';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap

/** Classify a File as 'docx' | 'pdf' | 'other' from name + MIME type. */
export function fileKind(file) {
  const name = (file && file.name ? file.name : '').toLowerCase();
  const type = (file && file.type ? file.type : '').toLowerCase();
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  return 'other';
}

/**
 * @returns {Promise<{ kind, supported, text, error? }>}
 */
export async function extractText(file) {
  const kind = fileKind(file);
  if (kind === 'other') return { kind, supported: false, text: '' };
  if (file.size > MAX_BYTES) return { kind, supported: true, text: '', error: 'too_large' };

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (kind === 'docx') return { kind, supported: true, text: extractDocxText(buf) };
    // PDF: lazy-load the parser chunk only now.
    const { extractPdfText } = await import('./pdf.js');
    return { kind, supported: true, text: await extractPdfText(buf) };
  } catch (e) {
    return { kind, supported: true, text: '', error: String(e) };
  }
}
