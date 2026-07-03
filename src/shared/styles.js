/* ============================================================================
 * AI Safety Guard — Design-system CSS (single source)
 * ----------------------------------------------------------------------------
 * One place that turns the JS token values in constants.js into CSS. Two
 * consumers share it, so the tokens and component classes are defined ONCE:
 *
 *   - extension pages (popup/onboarding): tokens.css is GENERATED from here
 *     (scripts/gen-tokens.mjs) and linked, so there is no flash of unstyled UI.
 *   - shadow-DOM UI (badge/modal): shadow-style.js builds its stylesheet from
 *     cssVars(':host') + componentCss() + its own shadow-only rules.
 *
 * No literal colors live here — everything comes from constants.js, so the
 * token lint gate stays green.
 * ========================================================================== */

import { BRAND, RISK, RADIUS, SPACE, TYPE, ELEVATION, FONTS } from './constants.js';

/** The full map of CSS custom properties, from the JS token source. */
export function tokenVars() {
  return {
    '--font-ui': FONTS.ui,
    '--font-data': FONTS.data,
    '--weight-regular': FONTS.weight.regular,
    '--weight-medium': FONTS.weight.medium,
    '--color-trust': BRAND.trust,
    '--color-ink': BRAND.ink,
    '--color-paper': BRAND.paper,
    '--color-muted': BRAND.muted,
    '--color-trust-hover': BRAND.trustHover,
    '--color-trust-soft': BRAND.trustSoft,
    '--color-border': BRAND.border,
    '--color-surface': BRAND.surface,
    '--color-on-trust': BRAND.onTrust,
    '--risk-safe-fg': RISK.safe.fg,
    '--risk-safe-bg': RISK.safe.bg,
    '--risk-medium-fg': RISK.medium.fg,
    '--risk-medium-bg': RISK.medium.bg,
    '--risk-high-fg': RISK.high.fg,
    '--risk-high-bg': RISK.high.bg,
    '--risk-critical-fg': RISK.critical.fg,
    '--risk-critical-bg': RISK.critical.bg,
    '--radius-sm': RADIUS.sm,
    '--radius-md': RADIUS.md,
    '--radius-lg': RADIUS.lg,
    '--radius-pill': RADIUS.pill,
    '--space-1': SPACE.s1,
    '--space-2': SPACE.s2,
    '--space-3': SPACE.s3,
    '--space-4': SPACE.s4,
    '--space-5': SPACE.s5,
    '--shadow-modal': ELEVATION.modal,
    '--shadow-badge': ELEVATION.badge,
    '--text-xs': TYPE.xs,
    '--text-sm': TYPE.sm,
    '--text-md': TYPE.md,
    '--text-lg': TYPE.lg,
    '--text-xl': TYPE.xl,
    '--line-snug': TYPE.lineSnug,
    '--line-normal': TYPE.lineNormal,
  };
}

/**
 * Render the token map as a CSS rule on `selector`.
 * `scrim`  adds --color-scrim (modal backdrop — only the shadow UI needs it).
 * `reset`  appends `all: initial;` (shadow :host isolation).
 */
export function cssVars(selector = ':root', { scrim = false, reset = false } = {}) {
  const v = tokenVars();
  if (scrim) v['--color-scrim'] = BRAND.scrim;
  const lines = Object.entries(v).map(([k, val]) => `  ${k}: ${val};`);
  if (reset) lines.push('  all: initial;');
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

/**
 * Shared component classes (var() only — no literal colors). Used by BOTH the
 * extension pages (via generated tokens.css) and the shadow-DOM UI.
 */
export function componentCss() {
  return `/* ============================================================================
 * AI Safety Guard — Token-based component helpers (static, var() only)
 * ----------------------------------------------------------------------------
 * This file is concatenated after the generated :root block to produce
 * tokens.css (see scripts/gen-tokens.mjs). It contains NO literal colors —
 * every value comes from a CSS variable defined by the generated :root, which
 * in turn comes from constants.js (the single source of truth).
 * ========================================================================== */

.asg-root {
  font-family: var(--font-ui);
  font-weight: var(--weight-regular);
  color: var(--color-ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Masked secrets / data values are ALWAYS mono. */
.asg-data {
  font-family: var(--font-data);
  font-weight: var(--weight-regular);
  letter-spacing: 0.01em;
}

/* Risk pill — A2 findings list (CRITICAL / HIGH / MEDIUM). */
.asg-pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-ui);
  font-weight: var(--weight-medium);
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.asg-pill--safe     { color: var(--risk-safe-fg);     background: var(--risk-safe-bg); }
.asg-pill--medium   { color: var(--risk-medium-fg);   background: var(--risk-medium-bg); }
.asg-pill--high     { color: var(--risk-high-fg);     background: var(--risk-high-bg); }
.asg-pill--critical { color: var(--risk-critical-fg); background: var(--risk-critical-bg); }

/* Severity dot for the inline badge (A1). */
.asg-dot {
  width: 8px; height: 8px; border-radius: var(--radius-pill);
  display: inline-block;
}
.asg-dot--safe     { background: var(--risk-safe-fg); }
.asg-dot--medium   { background: var(--risk-medium-fg); }
.asg-dot--high     { background: var(--risk-high-fg); }
.asg-dot--critical { background: var(--risk-critical-fg); }

/* Primary / secondary / link buttons. */
.asg-btn {
  font-family: var(--font-ui);
  font-weight: var(--weight-medium);
  font-size: var(--text-md);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  border: 1px solid transparent;
  cursor: pointer;
  line-height: 1;
}
.asg-btn--primary {
  background: var(--color-trust);
  color: var(--color-on-trust);
}
.asg-btn--primary:hover { background: var(--color-trust-hover); }
.asg-btn--secondary {
  background: transparent;
  color: var(--color-ink);
  border-color: var(--color-border);
}
.asg-btn--link {
  background: none;
  border: none;
  color: var(--color-trust);
  padding: 0;
  font-weight: var(--weight-medium);
  cursor: pointer;
}
/* Per-finding "Don't warn about this" mute control (modal rows). */
.asg-mute {
  font-size: var(--text-xs);
  margin-left: auto;
  white-space: nowrap;
}

/* Visible keyboard focus (WCAG 2.4.7) — shared by pages and shadow UI. */
.asg-btn:focus-visible {
  outline: 2px solid var(--color-trust);
  outline-offset: 2px;
}
`;
}
