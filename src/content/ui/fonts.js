/* ============================================================================
 * AI Safety Guard — CSP-safe font loading
 * ----------------------------------------------------------------------------
 * AI sites ship strict CSPs whose `font-src` does NOT allow chrome-extension:.
 * A @font-face that fetches chrome-extension://…woff2 at render time is refused,
 * so the badge/modal would silently fall back to system fonts.
 *
 * Fix: the content script fetches its OWN web_accessible_resource woff2 bytes
 * (extension-origin fetches from the isolated world are not subject to page CSP)
 * and registers them via the FontFace JS API into document.fonts. Fonts added
 * through document.fonts are resolvable inside shadow roots too — unlike a
 * @font-face *rule*, which is scoped per tree. No URL is fetched at paint time,
 * so font-src never applies.
 * ========================================================================== */

import { FONTS } from '../../shared/constants.js';
import { log } from '../../shared/log.js';

const FILES = [
  ['Hanken Grotesk', FONTS.weight.regular, 'hanken-grotesk-400.woff2'],
  ['Hanken Grotesk', FONTS.weight.medium, 'hanken-grotesk-500.woff2'],
  ['Spline Sans Mono', FONTS.weight.regular, 'spline-sans-mono-400.woff2'],
  ['Spline Sans Mono', FONTS.weight.medium, 'spline-sans-mono-500.woff2'],
];

let started = false;

export async function loadFonts(doc = document) {
  if (started) return;
  started = true;
  const canLoad =
    typeof FontFace !== 'undefined' &&
    doc.fonts &&
    typeof fetch !== 'undefined' &&
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    chrome.runtime.getURL;
  if (!canLoad) return; // e.g. test environment — shadow <style> @font-face still declared

  await Promise.all(
    FILES.map(async ([family, weight, file]) => {
      try {
        const buf = await (await fetch(chrome.runtime.getURL('assets/fonts/' + file))).arrayBuffer();
        const face = new FontFace(family, buf, {
          weight: String(weight),
          style: 'normal',
          display: 'swap',
        });
        await face.load();
        doc.fonts.add(face);
      } catch (e) {
        log.warn('could not load embedded font', file, e);
      }
    })
  );
}
