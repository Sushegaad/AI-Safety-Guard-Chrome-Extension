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

/** Full settings schema with defaults. */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  sensitivity: DEFAULT_SENSITIVITY, // "balanced"
  enabledSites: defaultEnabledSites(), // all supported sites on, from the registry
  customDomains: [],
  disabledCategories: [],
  scanAttachments: true, // scan attached PDF/DOCX files for PII
  analyticsEnabled: true, // opt-out
  onboardingComplete: false,
  riskySubmissionsCaught: 0, // lifetime counter shown in popup
});

/** Message types exchanged with the service worker. */
export const MSG = Object.freeze({
  GET_SETTINGS: 'GET_SETTINGS',
  SET_SETTINGS: 'SET_SETTINGS',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  RECORD_CATCH: 'RECORD_CATCH',
});

/** Deep-ish merge of stored values over defaults (enabledSites merged by key). */
export function withDefaults(stored = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    enabledSites: { ...DEFAULT_SETTINGS.enabledSites, ...(stored.enabledSites || {}) },
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
    out.customDomains = patch.customDomains
      .filter((d) => typeof d === 'string')
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, ''))
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
      .slice(0, 50);
  }
  if (has('disabledCategories') && Array.isArray(patch.disabledCategories)) {
    out.disabledCategories = patch.disabledCategories
      .filter((c) => typeof c === 'string')
      .slice(0, 50);
  }
  if (has('scanAttachments')) out.scanAttachments = !!patch.scanAttachments;
  if (has('analyticsEnabled')) out.analyticsEnabled = !!patch.analyticsEnabled;
  if (has('onboardingComplete')) out.onboardingComplete = !!patch.onboardingComplete;
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
