/* ============================================================================
 * AI Safety Guard — Design System Constants (Design v1)
 * ----------------------------------------------------------------------------
 * JS mirror of tokens.css. Use these in detector logic, badge/modal rendering,
 * popup, and onboarding so behavior and color stay in lockstep with the CSS.
 *
 * If you change a value here, change it in tokens.css too (and vice versa).
 * These are the canonical tokens — hardcoding other values anywhere is a bug.
 * ========================================================================== */

/* --- Typography ----------------------------------------------------------- */
export const FONTS = Object.freeze({
  ui: '"Hanken Grotesk", system-ui, -apple-system, sans-serif',
  data: '"Spline Sans Mono", ui-monospace, "SF Mono", monospace',
  // The only weights permitted. Never 600/700.
  weight: Object.freeze({ regular: 400, medium: 500 }),
  // woff2 files embedded in the package (no runtime CDN).
  files: Object.freeze({
    'Hanken Grotesk:400': 'assets/fonts/hanken-grotesk-400.woff2',
    'Hanken Grotesk:500': 'assets/fonts/hanken-grotesk-500.woff2',
    'Spline Sans Mono:400': 'assets/fonts/spline-sans-mono-400.woff2',
    'Spline Sans Mono:500': 'assets/fonts/spline-sans-mono-500.woff2',
  }),
});

/* --- Brand palette -------------------------------------------------------- */
export const BRAND = Object.freeze({
  trust: '#3B5BDB',      // primary blue — selected states, links, primary buttons
  ink: '#1A1A2E',        // all body text, headings
  paper: '#F8F7F4',      // warm off-white background
  muted: '#6B7280',      // secondary labels, timestamps, footer copy
  trustHover: '#2F4BC4',
  trustSoft: '#EAEDFB',
  border: '#E6E4DF',
  surface: '#FFFFFF',
  onTrust: '#FFFFFF',   // text/icon color on top of trust-blue buttons
  scrim: 'rgba(26, 26, 46, 0.32)', // modal backdrop (ink @ 32%)
});

/* --- Elevation (shadows) — tokenized so no surface hardcodes rgba ---------- */
export const ELEVATION = Object.freeze({
  modal: '0 12px 32px rgba(26, 26, 46, 0.16)',
  badge: '0 2px 8px rgba(26, 26, 46, 0.10)',
});

/* --- Shape & spacing scale (mirror of tokens.css) ------------------------- */
export const RADIUS = Object.freeze({ sm: '6px', md: '10px', lg: '14px', pill: '999px' });
export const SPACE = Object.freeze({ s1: '4px', s2: '8px', s3: '12px', s4: '16px', s5: '24px' });

/* --- Risk levels ----------------------------------------------------------
 * Ordered low → high. `rank` lets the detector pick "highest category wins".
 * Colors are DESATURATED by design (sage / ochre / terracotta / brick).
 * `badgeLabel` and `badgeDescription` are the exact strings from Design v1.
 * ------------------------------------------------------------------------- */
export const RISK = Object.freeze({
  safe: Object.freeze({
    id: 'safe', rank: 0,
    badgeLabel: 'Safe',
    badgeDescription: 'Nothing sensitive found.',
    pillLabel: 'SAFE',
    fg: '#4F7A65', bg: '#E8F0EB',
  }),
  medium: Object.freeze({
    id: 'medium', rank: 1,
    badgeLabel: 'Medium risk',
    badgeDescription: 'Possible personal or business info.',
    pillLabel: 'MEDIUM',
    fg: '#94794A', bg: '#F3EEDD',
  }),
  high: Object.freeze({
    id: 'high', rank: 2,
    badgeLabel: 'High risk',
    badgeDescription: 'Clear customer, legal or financial data.',
    pillLabel: 'HIGH',
    fg: '#B0795A', bg: '#F4E9DF',
  }),
  critical: Object.freeze({
    id: 'critical', rank: 3,
    badgeLabel: 'Critical risk',
    badgeDescription: 'Credentials, keys, SSNs, cards. Always interrupts.',
    pillLabel: 'CRITICAL',
    fg: '#AB5A55', bg: '#F4E3E1',
  }),
});

// Ordered list, lowest → highest severity.
export const RISK_ORDER = Object.freeze(['safe', 'medium', 'high', 'critical']);

/**
 * Given a list of risk-level ids, return the highest-severity one.
 * "Highest category always wins."
 * @param {string[]} levels
 * @returns {string} risk level id (defaults to 'safe')
 */
export function highestRisk(levels) {
  let winner = RISK.safe;
  for (const id of levels) {
    const level = RISK[id];
    if (level && level.rank > winner.rank) winner = level;
  }
  return winner.id;
}

/* --- Sensitivity modes ----------------------------------------------------
 * Three modes, selectable in onboarding and adjustable in the popup.
 * `interruptsOn` = the set of risk levels that trigger the A2 warning modal.
 * `badgeAlwaysVisible` = Strict keeps the badge on screen even when Safe.
 * Balanced is the default and is marked RECOMMENDED in onboarding.
 * ------------------------------------------------------------------------- */
export const SENSITIVITY = Object.freeze({
  basic: Object.freeze({
    id: 'basic',
    label: 'Basic',
    description: 'Warn only on credentials & critical data',
    interruptsOn: Object.freeze(['critical']),
    badgeAlwaysVisible: false,
    recommended: false,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    description: 'Warn on personal, business & sensitive data',
    interruptsOn: Object.freeze(['medium', 'high', 'critical']),
    badgeAlwaysVisible: false,
    recommended: true,   // ★ default — marked RECOMMENDED in onboarding
  }),
  strict: Object.freeze({
    id: 'strict',
    label: 'Strict',
    description: 'Flag everything; interrupt on medium and up',
    interruptsOn: Object.freeze(['medium', 'high', 'critical']),
    badgeAlwaysVisible: true,
    recommended: false,
  }),
});

export const DEFAULT_SENSITIVITY = 'balanced';

/**
 * Should a given risk level interrupt (show the A2 modal) under a mode?
 * Critical ALWAYS interrupts regardless of mode.
 * @param {string} riskLevel  one of RISK_ORDER
 * @param {string} sensitivityId  one of SENSITIVITY keys
 * @returns {boolean}
 */
export function shouldInterrupt(riskLevel, sensitivityId) {
  if (riskLevel === 'critical') return true;
  const mode = SENSITIVITY[sensitivityId] || SENSITIVITY[DEFAULT_SENSITIVITY];
  return mode.interruptsOn.includes(riskLevel);
}

/**
 * Should the inline badge be shown for this risk level under a mode?
 * Strict shows the badge always; other modes hide it when Safe.
 * @param {string} riskLevel
 * @param {string} sensitivityId
 * @returns {boolean}
 */
export function shouldShowBadge(riskLevel, sensitivityId) {
  const mode = SENSITIVITY[sensitivityId] || SENSITIVITY[DEFAULT_SENSITIVITY];
  if (mode.badgeAlwaysVisible) return true;
  return riskLevel !== 'safe';
}
