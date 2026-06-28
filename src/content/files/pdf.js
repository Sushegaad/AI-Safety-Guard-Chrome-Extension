/* ============================================================================
 * AI Safety Guard — PDF text extraction (on-device, lazy-loaded)
 * ----------------------------------------------------------------------------
 * pdf.js is large, so this module is only imported when a PDF is actually
 * attached (dynamic import in extract.js creates a separate chunk). The worker
 * is shipped as a web_accessible_resource and referenced via getURL.
 *
 * extractFromDoc() is split out as a pure-ish helper so the page-walking logic
 * is unit-testable with a mock pdf document (no real pdf.js needed in tests).
 * Everything stays on-device — no network.
 * ========================================================================== */

const MAX_PAGES = 50; // cap work on very large PDFs

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

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('assets/pdf.worker.min.mjs');
      } catch {
        /* not in extension context (tests) */
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function extractPdfText(uint8) {
  const pdfjs = await getPdfjs();
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
