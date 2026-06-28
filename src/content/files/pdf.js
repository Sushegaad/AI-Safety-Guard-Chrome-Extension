/* ============================================================================
 * AI Safety Guard — PDF text extraction (runs in the OFFSCREEN document)
 * ----------------------------------------------------------------------------
 * pdf.js needs a worker and a DOM, which makes a content script the wrong host.
 * This module is bundled into the offscreen document instead, where pdf.js and
 * its worker run on the extension's own origin (no host-page CSP, reliable
 * publicPath). Static import keeps it out of the content bundle entirely.
 *
 * extractFromDoc() is split out as a pure helper so the page-walking logic is
 * unit-testable with a mock pdf document (no real pdf.js in tests).
 * ========================================================================== */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PAGES = 50; // cap work on very large PDFs

try {
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('assets/pdf.worker.min.mjs');
} catch {
  /* not in extension context (tests) */
}

/** Walk a loaded pdf.js document and join its text. Injected/testable. */
export async function extractFromDoc(doc) {
  const pages = Math.min(doc.numPages || 0, MAX_PAGES);
  let text = '';
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => i.str).join(' ') + ' ';
  }
  return text.replace(/\s+/g, ' ').trim();
}

export async function extractPdfText(uint8) {
  const doc = await pdfjs.getDocument({ data: uint8 }).promise;
  try {
    return await extractFromDoc(doc);
  } finally {
    try {
      doc.destroy();
    } catch {
      /* ignore */
    }
  }
}
