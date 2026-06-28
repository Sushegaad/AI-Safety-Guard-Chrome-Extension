/* ============================================================================
 * AI Safety Guard — Shadow-DOM styling
 * ----------------------------------------------------------------------------
 * All injected UI (badge, modal, redact) lives inside a shadow root to
 * isolate it from the host site's CSS. Fonts are NOT inherited into shadow
 * roots, so we declare @font-face *inside* the shadow root, pointing at the
 * extension's embedded woff2 via chrome.runtime.getURL (web_accessible_resource).
 *
 * Every color/weight/shadow comes from constants.js — there are NO hardcoded
 * hex values in this file (the token-enforcement lint gate depends on that).
 * ========================================================================== */

import { SPACE } from '../../shared/constants.js';
import { cssVars, componentCss } from '../../shared/styles.js';
import { logoDataUri } from '../../shared/logo.js';

/**
 * Full CSS string for the shadow root. The token variables and the shared
 * component classes come from the single style source (shared/styles.js); only
 * the shadow-specific layout (badge, overlay, card) lives here. Var names match
 * the extension pages, so there is no second naming scheme to keep in sync.
 *
 * Fonts are NOT declared here as @font-face — that would fetch a
 * chrome-extension: URL at paint time, which the host site's font-src CSP
 * refuses. loadFonts() (ui/fonts.js) registers the woff2 via the FontFace API
 * into document.fonts, which resolves inside shadow roots too.
 */
export function getShadowCss() {
  return cssVars(':host', { scrim: true, reset: true }) + componentCss() + shadowOnlyCss();
}

// Shadow-only layout that the extension pages don't use. Modal buttons are
// full-width here (overriding the shared .asg-btn default).
function shadowOnlyCss() {
  return `
* { box-sizing: border-box; font-family: var(--font-ui); }

/* ---- A1: inline badge ---- */
.asg-badge {
  display: inline-flex; flex-direction: column; gap: 2px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: ${SPACE.s2} ${SPACE.s3};
  box-shadow: var(--shadow-badge); color: var(--color-ink);
  font-size: 13px; line-height: 1.3; max-width: 280px;
}
.asg-badge__label { display: inline-flex; align-items: center; gap: ${SPACE.s2}; font-weight: var(--weight-medium); }
.asg-badge__meta { color: var(--color-muted); font-size: 11px; }
.asg-dot { flex: 0 0 auto; }

/* ---- Overlay / modal (A2 / B1) ---- */
.asg-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--color-scrim);
  display: flex; align-items: center; justify-content: center;
  padding: ${SPACE.s4};
}
.asg-card {
  background: var(--color-paper); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal); width: 440px; max-width: 100%;
  max-height: 90vh; overflow: auto; color: var(--color-ink);
}
.asg-card__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: ${SPACE.s4} ${SPACE.s4} 0;
}
.asg-wordmark { display: inline-flex; align-items: center; gap: ${SPACE.s2}; font-weight: var(--weight-medium); font-size: 13px; }
.asg-wordmark__dot { width: 18px; height: 18px; background: url("${logoDataUri()}") center / contain no-repeat; display: inline-block; }
.asg-x { background: none; border: none; color: var(--color-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; }
.asg-card__body { padding: ${SPACE.s3} ${SPACE.s4} ${SPACE.s4}; }
.asg-title { font-weight: var(--weight-medium); font-size: 19px; margin: ${SPACE.s2} 0 ${SPACE.s1}; }
.asg-subtitle { color: var(--color-muted); font-size: 14px; line-height: 1.5; margin: 0 0 ${SPACE.s3}; }

/* findings list */
.asg-findings { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.asg-find { display: flex; align-items: center; gap: ${SPACE.s3}; padding: ${SPACE.s3}; border-bottom: 1px solid var(--color-border); }
.asg-find:last-child { border-bottom: none; }
.asg-find__type { flex: 1 1 auto; font-size: 14px; }
.asg-find__val { color: var(--color-ink); font-size: 13px; }

/* footer */
.asg-note { display: flex; align-items: center; gap: ${SPACE.s2}; color: var(--risk-safe-fg); background: var(--risk-safe-bg); border-radius: var(--radius-sm); padding: ${SPACE.s2} ${SPACE.s3}; font-size: 12px; margin: ${SPACE.s3} 0; }
.asg-actions { display: flex; flex-direction: column; gap: ${SPACE.s2}; margin-top: ${SPACE.s3}; }
.asg-row { display: flex; align-items: center; justify-content: space-between; margin-top: ${SPACE.s2}; }

/* modal buttons are full-width (override the shared .asg-btn default) */
.asg-btn { width: 100%; }
.asg-btn--ghost { width: auto; padding: 8px; }
.asg-btn--link { width: auto; padding: 8px; }

/* B1 redaction chips */
.asg-redacted { font-size: 14px; line-height: 1.7; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: ${SPACE.s3}; white-space: pre-wrap; }
.asg-chip { font-family: var(--font-data); font-size: 12px; color: var(--color-trust); background: var(--color-trust-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin: 0 1px; }
`;
}

/**
 * Create a shadow host attached to the document, with the style injected.
 * Prefers a constructable adoptedStyleSheet (not subject to the page's
 * style-src CSP); falls back to a <style> element where constructable
 * stylesheets are unavailable (e.g. jsdom in tests).
 * Returns { host, root } where root is the shadowRoot to append UI into.
 */
export function createShadowHost(doc = document, id = 'asg-shadow-host') {
  const host = doc.createElement('div');
  host.id = id;
  host.style.all = 'initial';
  const root = host.attachShadow({ mode: 'open' });
  const css = getShadowCss();

  let applied = false;
  try {
    const view = doc.defaultView;
    if (view && typeof view.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in root) {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      applied = true;
    }
  } catch {
    applied = false;
  }
  if (!applied) {
    const style = doc.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }
  return { host, root };
}
