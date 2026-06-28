/* ============================================================================
 * AI Safety Guard — File text extraction (content-script side)
 * ----------------------------------------------------------------------------
 * DOCX is parsed inline (fflate is tiny, pure, synchronous). PDF parsing does
 * NOT happen here: pdf.js needs a worker and would force a dynamic chunk into
 * the content bundle (which breaks content-script publicPath). PDFs are routed
 * to an offscreen document by the orchestrator instead. So for PDF we just
 * signal `needsOffscreen`.
 * ========================================================================== */

import { extractDocxText } from './docx.js';

const MAX_DOCX_BYTES = 25 * 1024 * 1024; // 25 MB
// PDFs travel content -> SW -> offscreen as base64 (~+33%), so cap lower to stay
// well clear of message-size limits and memory spikes.
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Classify a File as 'docx' | 'pdf' | 'other' from name + MIME type. */
export function fileKind(file) {
  const name = (file && file.name ? file.name : '').toLowerCase();
  const type = (file && file.type ? file.type : '').toLowerCase();
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  return 'other';
}

/**
 * @returns {Promise<{ kind, supported, text, needsOffscreen?, error? }>}
 */
export async function extractText(file) {
  const kind = fileKind(file);
  if (kind === 'other') return { kind, supported: false, text: '' };
  const cap = kind === 'pdf' ? MAX_PDF_BYTES : MAX_DOCX_BYTES;
  if (file.size > cap) return { kind, supported: true, text: '', error: 'too_large' };

  if (kind === 'pdf') {
    // Parsed in the offscreen document; the caller forwards the bytes.
    return { kind, supported: true, text: '', needsOffscreen: true };
  }

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    return { kind, supported: true, text: extractDocxText(buf) };
  } catch (e) {
    return { kind, supported: true, text: '', error: String(e) };
  }
}
