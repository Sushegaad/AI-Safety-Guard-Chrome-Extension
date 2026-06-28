/* ============================================================================
 * AI Safety Guard — Offscreen document (PDF parser host)
 * ----------------------------------------------------------------------------
 * Runs pdf.js (and its worker) on the extension's own origin, isolated from any
 * host page. The service worker creates this document on demand and relays PDF
 * bytes here; we extract the text locally and return it. Nothing leaves the
 * device.
 * ========================================================================== */

import { extractPdfText } from '../content/files/pdf.js';
import { base64ToBytes } from '../shared/base64.js';

const OFFSCREEN_PDF = 'ASG_OFFSCREEN_PDF';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Defense-in-depth: only accept messages from THIS extension's own contexts.
  if (sender && sender.id && sender.id !== chrome.runtime.id) return;
  if (!msg || msg.type !== OFFSCREEN_PDF) return; // not for us
  (async () => {
    try {
      const bytes = base64ToBytes(msg.dataB64 || '');
      const text = await extractPdfText(bytes);
      sendResponse({ text });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  })();
  return true; // async response
});
