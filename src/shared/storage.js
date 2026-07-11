/* ============================================================================
 * AI Safety Guard — Settings storage & message protocol
 * ----------------------------------------------------------------------------
 * Single source of truth for the settings schema and the message types used
 * between content scripts / popup / onboarding and the service worker.
 *
 * The SERVICE WORKER owns all chrome.storage reads/writes (the read/write
 * helpers below run there). MV3 service workers are ephemeral, so every handler
 * reads from storage fresh — never from memory.
 * ========================================================================== */

import { DEFAULT_SENSITIVITY, SENSITIVITY } from './constants.js';
import { defaultEnabledSites } from './sites.js';
import { normalizeHostname } from './domains.js';

/** Full settings schema with defaults. */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  sensitivity: DEFAULT_SENSITIVITY, // "balanced"
  enabledSites: defaultEnabledSites(), // all supported sites on, from the registry
  customDomains: [],
  disabledCategories: [], // user-muted detection categories ("don't warn again")
  scanAttachments: true, // scan attached PDF/DOCX files for PII
  onboardingComplete: false,
  riskySubmissionsCaught: 0, // lifetime "caught" counter shown in popup
  // Outcome split for the caught counter — what the user did after a warning.
  // All local, never uploaded (see PRIVACY.md).
  outcomes: Object.freeze({ redacted: 0, sentAnyway: 0, edited: 0 }),
  // Optional, off by default: a local-only list of recent catches shown in the
  // popup ({ t, items: [{ category, masked }] }). MASKED values only — the raw
  // secret never reaches storage. Capped at RECENT_CATCHES_MAX, clearable.
  catchHistory: false,
  recentCatches: [],
  // One-time popup hint when "sent anyway" dominates outcomes (self-tuning
  // nudge, see shouldShowNoiseHint). Set true once dismissed.
  noiseHintDismissed: false,
  // Shield Mode: per-site opt-in. When on, typing/pasting happens inside an
  // extension-origin iframe the provider's page scripts cannot read; only
  // approved (optionally redacted) text is injected into the real composer.
  // Default OFF everywhere — it changes the typing surface, never silently.
  shieldMode: {},
  // One-time per-site "this provider can receive text as you type" capability
  // notice. Keyed by site id / custom host → true once dismissed.
  perSiteNoticeSeen: {},
});

export const RECENT_CATCHES_MAX = 20;

/**
 * The feedback loop actually looping: if the user overrides most warnings,
 * the thresholds are miscalibrated for them — say so once, in the popup.
 * Requires a meaningful sample (≥ 20 outcomes) and a >60% override rate.
 */
export function shouldShowNoiseHint(settings) {
  if (!settings || settings.noiseHintDismissed) return false;
  const o = settings.outcomes || {};
  const total = (o.redacted || 0) + (o.sentAnyway || 0) + (o.edited || 0);
  return total >= 20 && (o.sentAnyway || 0) / total > 0.6;
}

/**
 * Categories that can never be muted: critical secrets where a single miss is
 * catastrophic. Keep in sync with the risk:'critical' entries in detector.js
 * CATEGORY (listed here so the service worker doesn't import the engine).
 */
export const UNMUTABLE_CATEGORIES = Object.freeze([
  'api_key', 'password', 'connection_string', 'private_key', 'iban',
  'credit_card', 'ssn', 'gov_id',
]);

/** Message types exchanged with the service worker. */
export const MSG = Object.freeze({
  GET_SETTINGS: 'GET_SETTINGS',
  SET_SETTINGS: 'SET_SETTINGS',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  RECORD_CATCH: 'RECORD_CATCH',
  RECORD_OUTCOME: 'RECORD_OUTCOME', // { action: 'redacted'|'sentAnyway'|'edited' }
  MUTE_CATEGORY: 'MUTE_CATEGORY', // { category } — adds to disabledCategories
  EXTRACT_PDF: 'EXTRACT_PDF', // content -> SW -> offscreen: parse a PDF locally
  // Shield Mode: the secure-composer iframe sends approved text to the service
  // worker, which relays it to the originating tab's content script. Routed
  // via the SW (not window.postMessage) so approved text never crosses the
  // provider page's window until the content script injects it deliberately.
  SHIELD_SUBMIT: 'SHIELD_SUBMIT', // iframe -> SW: { text, redacted, send, nonce }
  SHIELD_INJECT: 'SHIELD_INJECT', // SW -> content script: { text, send, nonce }
  SHIELD_CANCEL: 'SHIELD_CANCEL', // iframe -> SW -> content: { nonce }
  SHIELD_RESIZE: 'SHIELD_RESIZE', // iframe -> SW -> content: { height, nonce } — px number only, never content
});

export const OUTCOME_ACTIONS = Object.freeze(['redacted', 'sentAnyway', 'edited']);

/** Deep-ish merge of stored values over defaults (enabledSites merged by key). */
export function withDefaults(stored = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    enabledSites: { ...DEFAULT_SETTINGS.enabledSites, ...(stored.enabledSites || {}) },
    outcomes: { ...DEFAULT_SETTINGS.outcomes, ...(stored.outcomes || {}) },
    shieldMode: { ...(stored.shieldMode || {}) },
    perSiteNoticeSeen: { ...(stored.perSiteNoticeSeen || {}) },
  };
}

/**
 * Whitelist + type-check an incoming settings patch. Untrusted callers can only
 * ever write known keys with valid values, never arbitrary storage entries.
 * This is the security boundary for SET_SETTINGS.
 */
export function sanitizePatch(patch = {}) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);

  if (has('enabled')) out.enabled = !!patch.enabled;
  if (has('sensitivity') && Object.keys(SENSITIVITY).includes(patch.sensitivity)) {
    out.sensitivity = patch.sensitivity;
  }
  if (has('enabledSites') && patch.enabledSites && typeof patch.enabledSites === 'object') {
    const sites = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.enabledSites)) {
      if (k in patch.enabledSites) sites[k] = !!patch.enabledSites[k];
    }
    out.enabledSites = sites;
  }
  if (has('customDomains') && Array.isArray(patch.customDomains)) {
    // Same validator the popup uses (shared/domains.js) — the two can't drift.
    out.customDomains = [...new Set(
      patch.customDomains
        .filter((d) => typeof d === 'string')
        .map((d) => normalizeHostname(d).host)
        .filter(Boolean)
    )].slice(0, 50);
  }
  if (has('disabledCategories') && Array.isArray(patch.disabledCategories)) {
    out.disabledCategories = patch.disabledCategories
      .filter((c) => typeof c === 'string')
      // Critical secret categories can never be muted, whatever the caller says.
      .filter((c) => !UNMUTABLE_CATEGORIES.includes(c))
      .slice(0, 50);
  }
  if (has('scanAttachments')) out.scanAttachments = !!patch.scanAttachments;
  if (has('onboardingComplete')) out.onboardingComplete = !!patch.onboardingComplete;
  if (has('catchHistory')) out.catchHistory = !!patch.catchHistory;
  if (has('noiseHintDismissed')) out.noiseHintDismissed = !!patch.noiseHintDismissed;
  // Per-site boolean maps: keep only string keys with coerced boolean values,
  // capped so a hostile caller can't bloat storage.
  for (const key of ['shieldMode', 'perSiteNoticeSeen']) {
    if (has(key) && patch[key] && typeof patch[key] === 'object') {
      const clean = {};
      for (const k of Object.keys(patch[key]).slice(0, 100)) {
        if (typeof k === 'string' && k.length <= 253) clean[k] = !!patch[key][k];
      }
      out[key] = clean;
    }
  }
  // History entries are written only by the service worker (recordCatch);
  // external callers may only CLEAR the list, never inject entries.
  if (has('recentCatches') && Array.isArray(patch.recentCatches) && patch.recentCatches.length === 0) {
    out.recentCatches = [];
  }
  if (has('riskySubmissionsCaught') && Number.isFinite(patch.riskySubmissionsCaught)) {
    out.riskySubmissionsCaught = Math.max(0, Math.floor(patch.riskySubmissionsCaught));
  }
  return out;
}

/* --- service-worker-side helpers (require chrome.storage.local) ----------- */

export async function readSettings(area) {
  const storage = area || chrome.storage.local;
  const stored = await storage.get(DEFAULT_SETTINGS);
  return withDefaults(stored);
}

export async function writeSettings(patch, area) {
  const storage = area || chrome.storage.local;
  await storage.set(sanitizePatch(patch));
  return readSettings(storage);
}

/** Increment the lifetime "risky sends caught" counter; returns the new value. */
export async function bumpCatch(area) {
  const storage = area || chrome.storage.local;
  const { riskySubmissionsCaught } = await storage.get({ riskySubmissionsCaught: 0 });
  const next = (riskySubmissionsCaught || 0) + 1;
  await storage.set({ riskySubmissionsCaught: next });
  return next;
}

/**
 * Record a catch: bump the counter and, when the user has opted into local
 * catch history, prepend a MASKED-values-only entry (capped, clearable).
 * Findings are validated defensively: strings only, length-capped, item-capped.
 */
export async function recordCatch(findings, area) {
  const storage = area || chrome.storage.local;
  const riskySubmissionsCaught = await bumpCatch(storage);
  const { catchHistory, recentCatches } = await storage.get({ catchHistory: false, recentCatches: [] });
  if (catchHistory && Array.isArray(findings) && findings.length) {
    const items = findings
      .filter((f) => f && typeof f.category === 'string' && typeof f.masked === 'string')
      .slice(0, 10)
      .map((f) => ({ category: f.category.slice(0, 32), masked: f.masked.slice(0, 40) }));
    if (items.length) {
      const list = Array.isArray(recentCatches) ? recentCatches : [];
      await storage.set({
        recentCatches: [{ t: Date.now(), items }, ...list].slice(0, RECENT_CATCHES_MAX),
      });
    }
  }
  return { riskySubmissionsCaught };
}

/**
 * Record what the user did after a warning (local feedback loop only — if
 * "sent anyway" dominates, the thresholds are wrong). Returns new outcomes.
 */
export async function bumpOutcome(action, area) {
  const storage = area || chrome.storage.local;
  if (!OUTCOME_ACTIONS.includes(action)) return null;
  const { outcomes } = await storage.get({ outcomes: DEFAULT_SETTINGS.outcomes });
  const next = { ...DEFAULT_SETTINGS.outcomes, ...(outcomes || {}) };
  next[action] = (next[action] || 0) + 1;
  await storage.set({ outcomes: next });
  return next;
}

/**
 * Add a category to disabledCategories ("don't warn again"). Rejects
 * unmutable (critical-secret) categories. Returns the fresh settings.
 */
export async function muteCategory(category, area) {
  const storage = area || chrome.storage.local;
  if (typeof category !== 'string' || UNMUTABLE_CATEGORIES.includes(category)) {
    return readSettings(storage);
  }
  const { disabledCategories } = await storage.get({ disabledCategories: [] });
  const list = Array.isArray(disabledCategories) ? disabledCategories : [];
  if (!list.includes(category)) {
    await storage.set({ disabledCategories: [...list, category].slice(0, 50) });
  }
  return readSettings(storage);
}
