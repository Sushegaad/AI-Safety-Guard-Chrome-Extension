/* ============================================================================
 * AI Safety Guard — Shadow-DOM styling
 * ----------------------------------------------------------------------------
 * All injected UI (badge, modal, redact, rewrite) lives inside a shadow root to
 * isolate it from the host site's CSS. Fonts are NOT inherited into shadow
 * roots, so we declare @font-face *inside* the shadow root, pointing at the
 * extension's embedded woff2 via chrome.runtime.getURL (web_accessible_resource).
 *
 * Every color/weight/shadow comes from constants.js — there are NO hardcoded
 * hex values in this file (the token-enforcement lint gate depends on that).
 * ========================================================================== */

import { BRAND, RISK, FONTS, ELEVATION, RADIUS, SPACE } from '../../shared/constants.js';

/**
 * Full CSS string for the shadow root: tokens + component rules.
 * Fonts are NOT declared here as @font-face — that would fetch a
 * chrome-extension: URL at paint time, which the host site's font-src CSP
 * refuses. Instead loadFonts() (ui/fonts.js) registers the woff2 via the
 * FontFace API into document.fonts, which resolves inside shadow roots too.
 */
export function getShadowCss() {
  return `
:host {
  --font-ui: ${FONTS.ui};
  --font-data: ${FONTS.data};
  --w-regular: ${FONTS.weight.regular};
  --w-medium: ${FONTS.weight.medium};
  --trust: ${BRAND.trust};
  --trust-hover: ${BRAND.trustHover};
  --trust-soft: ${BRAND.trustSoft};
  --ink: ${BRAND.ink};
  --paper: ${BRAND.paper};
  --muted: ${BRAND.muted};
  --border: ${BRAND.border};
  --surface: ${BRAND.surface};
  --on-trust: ${BRAND.onTrust};
  --scrim: ${BRAND.scrim};
  --safe-fg: ${RISK.safe.fg};     --safe-bg: ${RISK.safe.bg};
  --medium-fg: ${RISK.medium.fg}; --medium-bg: ${RISK.medium.bg};
  --high-fg: ${RISK.high.fg};     --high-bg: ${RISK.high.bg};
  --critical-fg: ${RISK.critical.fg}; --critical-bg: ${RISK.critical.bg};
  --shadow-modal: ${ELEVATION.modal};
  --shadow-badge: ${ELEVATION.badge};
  --r-sm: ${RADIUS.sm}; --r-md: ${RADIUS.md}; --r-lg: ${RADIUS.lg}; --r-pill: ${RADIUS.pill};
  all: initial;
}

* { box-sizing: border-box; font-family: var(--font-ui); }
.asg-data { font-family: var(--font-data); letter-spacing: 0.01em; }

/* ---- A1: inline badge ---- */
.asg-badge {
  display: inline-flex; flex-direction: column; gap: 2px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: ${SPACE.s2} ${SPACE.s3};
  box-shadow: var(--shadow-badge); color: var(--ink);
  font-size: 13px; line-height: 1.3; max-width: 280px;
}
.asg-badge__label { display: inline-flex; align-items: center; gap: ${SPACE.s2}; font-weight: var(--w-medium); }
.asg-badge__meta { color: var(--muted); font-size: 11px; }
.asg-dot { width: 8px; height: 8px; border-radius: var(--r-pill); display: inline-block; flex: 0 0 auto; }
.asg-dot--safe { background: var(--safe-fg); }
.asg-dot--medium { background: var(--medium-fg); }
.asg-dot--high { background: var(--high-fg); }
.asg-dot--critical { background: var(--critical-fg); }

/* ---- Overlay shared by A2 / B1 / B2 ---- */
.asg-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  background: var(--scrim);
  display: flex; align-items: center; justify-content: center;
  padding: ${SPACE.s4};
}
.asg-card {
  background: var(--paper); border-radius: var(--r-lg);
  box-shadow: var(--shadow-modal); width: 440px; max-width: 100%;
  max-height: 90vh; overflow: auto; color: var(--ink);
}
.asg-card__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: ${SPACE.s4} ${SPACE.s4} 0;
}
.asg-wordmark { display: inline-flex; align-items: center; gap: ${SPACE.s2}; font-weight: var(--w-medium); font-size: 13px; }
.asg-wordmark__dot { width: 16px; height: 16px; border-radius: var(--r-sm); background: var(--trust); display: inline-block; }
.asg-x { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; }
.asg-card__body { padding: ${SPACE.s3} ${SPACE.s4} ${SPACE.s4}; }
.asg-title { font-weight: var(--w-medium); font-size: 19px; margin: ${SPACE.s2} 0 ${SPACE.s1}; }
.asg-subtitle { color: var(--muted); font-size: 14px; line-height: 1.5; margin: 0 0 ${SPACE.s3}; }

/* findings list */
.asg-findings { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.asg-find { display: flex; align-items: center; gap: ${SPACE.s3}; padding: ${SPACE.s3}; border-bottom: 1px solid var(--border); }
.asg-find:last-child { border-bottom: none; }
.asg-find__type { flex: 1 1 auto; font-size: 14px; }
.asg-find__val { color: var(--ink); font-size: 13px; }

/* pills */
.asg-pill { font-weight: var(--w-medium); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: var(--r-pill); }
.asg-pill--safe { color: var(--safe-fg); background: var(--safe-bg); }
.asg-pill--medium { color: var(--medium-fg); background: var(--medium-bg); }
.asg-pill--high { color: var(--high-fg); background: var(--high-bg); }
.asg-pill--critical { color: var(--critical-fg); background: var(--critical-bg); }

/* footer + buttons */
.asg-note { display: flex; align-items: center; gap: ${SPACE.s2}; color: var(--safe-fg); background: var(--safe-bg); border-radius: var(--r-sm); padding: ${SPACE.s2} ${SPACE.s3}; font-size: 12px; margin: ${SPACE.s3} 0; }
.asg-actions { display: flex; flex-direction: column; gap: ${SPACE.s2}; margin-top: ${SPACE.s3}; }
.asg-row { display: flex; align-items: center; justify-content: space-between; margin-top: ${SPACE.s2}; }
.asg-btn { font-family: var(--font-ui); font-weight: var(--w-medium); font-size: 14px; border-radius: var(--r-md); padding: 10px 16px; border: 1px solid transparent; cursor: pointer; width: 100%; }
.asg-btn--primary { background: var(--trust); color: var(--on-trust); }
.asg-btn--primary:hover { background: var(--trust-hover); }
.asg-btn--secondary { background: transparent; color: var(--ink); border-color: var(--border); }
.asg-btn--ghost { background: transparent; color: var(--ink); border: none; width: auto; padding: 8px; }
.asg-btn--link { background: none; border: none; color: var(--trust); cursor: pointer; font-weight: var(--w-medium); width: auto; padding: 8px; }

/* B1 redaction chips */
.asg-redacted { font-size: 14px; line-height: 1.7; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: ${SPACE.s3}; white-space: pre-wrap; }
.asg-chip { font-family: var(--font-data); font-size: 12px; color: var(--trust); background: var(--trust-soft); padding: 1px 6px; border-radius: var(--r-sm); margin: 0 1px; }

/* B2 two-column compare */
.asg-compare { display: grid; grid-template-columns: 1fr 1fr; gap: ${SPACE.s3}; }
.asg-col__label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: ${SPACE.s1}; }
.asg-col__text { font-size: 13px; line-height: 1.5; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: ${SPACE.s3}; min-height: 96px; white-space: pre-wrap; }
.asg-removed { color: var(--muted); font-size: 12px; margin: ${SPACE.s3} 0 0; }
.asg-disclosure { display: flex; align-items: flex-start; gap: ${SPACE.s2}; color: var(--muted); font-size: 12px; line-height: 1.4; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: ${SPACE.s3}; margin: ${SPACE.s3} 0; }
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
