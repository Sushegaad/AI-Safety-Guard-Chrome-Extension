/* ============================================================================
 * AI Safety Guard — Background Service Worker (MV3)
 * ----------------------------------------------------------------------------
 * The single owner of chrome.storage reads/writes and the message hub for
 * content scripts / popup / onboarding.
 *
 * MV3 service workers are EPHEMERAL — they shut down when idle. We never hold
 * settings in memory; every handler reads from chrome.storage fresh.
 * ========================================================================== */

import { MSG, readSettings, writeSettings, recordCatch, bumpOutcome, muteCategory } from '../shared/storage.js';
import { scriptIdFor, originFor } from '../shared/domains.js';

/* --- First run: open onboarding ------------------------------------------ */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
  reconcileCustomDomains().catch(() => {});
});
chrome.runtime.onStartup?.addListener(() => {
  reconcileCustomDomains().catch(() => {});
});
// A grant revoked from chrome://extensions should prune its registration
// immediately, not at the next browser start.
chrome.permissions?.onRemoved?.addListener(() => {
  reconcileCustomDomains().catch(() => {});
});

/* --- Custom domains: dynamic content-script reconciliation ----------------
 * The SERVICE WORKER is the single owner of chrome.scripting registrations.
 * The popup only requests the permission grant (user gesture) and persists
 * settings.customDomains; this reconcile makes reality match the settings:
 *   - register a script for every wanted domain whose origin is granted
 *   - unregister scripts for domains that were removed or whose grant was
 *     revoked via chrome://extensions (the known Chrome quirk: dynamic
 *     registrations survive a revoked grant)
 *   - drop grants for origins the user no longer wants
 * Runs on install, startup, permission revocation, and settings writes.
 * Exported (with injectable deps) for tests.
 * ------------------------------------------------------------------------- */
const SCRIPT_ID_PREFIX = 'aisg-';
// The BUILT content bundle: webpack mirrors the source tree into dist/, and
// the packed extension is dist/, so this path is valid at runtime.
const CONTENT_SCRIPT_JS = 'src/content/content.js';

export async function reconcileCustomDomains(deps = {}) {
  const read = deps.readSettings || readSettings;
  const scripting = deps.scripting || (typeof chrome !== 'undefined' && chrome.scripting);
  const permissions = deps.permissions || (typeof chrome !== 'undefined' && chrome.permissions);
  if (!scripting || !permissions) return { registered: [], unregistered: [], revoked: [] };

  const settings = await read();
  const wanted = new Set(settings.customDomains || []);

  const grantedOrigins = new Set(((await permissions.getAll()) || {}).origins || []);
  const registered = (await scripting.getRegisteredContentScripts()) || [];
  const ours = registered.filter((s) => s.id && s.id.startsWith(SCRIPT_ID_PREFIX));
  const registeredHosts = new Set(ours.map((s) => s.id.slice(SCRIPT_ID_PREFIX.length)));

  const toRegister = [...wanted].filter(
    (host) => grantedOrigins.has(originFor(host)) && !registeredHosts.has(host)
  );
  const toUnregister = [...registeredHosts].filter(
    (host) => !wanted.has(host) || !grantedOrigins.has(originFor(host))
  );
  // Revoke grants for custom domains the user removed. Only origins that map
  // to one of OUR dynamic registrations qualify — the six static host grants
  // never have an aisg- registration, so they can never be touched here.
  const toRevoke = [...grantedOrigins].filter((origin) => {
    const m = /^https:\/\/([^/*]+)\/\*$/.exec(origin);
    return !!m && !wanted.has(m[1]) && registeredHosts.has(m[1]);
  });

  if (toRegister.length) {
    await scripting.registerContentScripts(
      toRegister.map((host) => ({
        id: scriptIdFor(host),
        matches: [originFor(host)],
        js: [CONTENT_SCRIPT_JS],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      }))
    );
  }
  if (toUnregister.length) {
    await scripting.unregisterContentScripts({ ids: toUnregister.map(scriptIdFor) });
  }
  for (const origin of toRevoke) {
    try {
      await permissions.remove({ origins: [origin] });
    } catch {
      /* revoking an already-gone grant is fine */
    }
  }
  return { registered: toRegister, unregistered: toUnregister, revoked: toRevoke };
}

/* --- Broadcast settings to every content script -------------------------- */
async function broadcastSettings(settings) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id) continue;
    // Tabs without our content script will reject — ignore those.
    chrome.tabs.sendMessage(tab.id, { type: MSG.SETTINGS_UPDATED, settings }).catch(() => {});
  }
}

/* --- Offscreen document: hosts pdf.js to parse PDFs locally --------------- */
const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const OFFSCREEN_PDF = 'ASG_OFFSCREEN_PDF';

async function ensureOffscreen() {
  try {
    if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) return;
  } catch {
    /* fall through to create */
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Parse attached PDFs locally to scan for sensitive data before they reach an AI tool.',
    });
  } catch {
    // Most likely "only a single offscreen document may be created" — fine.
  }
}

// Close the offscreen document once it has been idle, so pdf.js isn't held in
// memory between attachments.
const OFFSCREEN_IDLE_MS = 30_000;
let offscreenIdleTimer = null;
function scheduleOffscreenClose() {
  if (offscreenIdleTimer) clearTimeout(offscreenIdleTimer);
  offscreenIdleTimer = setTimeout(() => {
    offscreenIdleTimer = null;
    chrome.offscreen.closeDocument().catch(() => {});
  }, OFFSCREEN_IDLE_MS);
}

// Relay PDF bytes to the offscreen document and return the extracted text.
async function extractPdfViaOffscreen(dataB64) {
  if (offscreenIdleTimer) {
    clearTimeout(offscreenIdleTimer);
    offscreenIdleTimer = null;
  }
  await ensureOffscreen();
  try {
    const r = await chrome.runtime.sendMessage({ type: OFFSCREEN_PDF, dataB64 });
    if (!r || r.error) throw new Error((r && r.error) || 'offscreen_failed');
    return r.text || '';
  } finally {
    scheduleOffscreenClose();
  }
}

/**
 * Pure-ish message router (exported for tests). Calls the injected storage
 * helpers and returns the response object to send back.
 */
export async function routeMessage(msg, deps = {}) {
  const read = deps.readSettings || readSettings;
  const write = deps.writeSettings || writeSettings;
  const broadcast = deps.broadcast || broadcastSettings;

  switch (msg && msg.type) {
    case MSG.GET_SETTINGS:
      return read();
    case MSG.SET_SETTINGS: {
      const settings = await write(msg.patch || {});
      // Keep dynamic registrations in step when customDomains change.
      if (msg.patch && 'customDomains' in msg.patch) {
        const reconcile = deps.reconcile || reconcileCustomDomains;
        try {
          await reconcile(deps);
        } catch {
          /* reconciliation is self-healing on next startup */
        }
      }
      await broadcast(settings);
      return settings;
    }
    case MSG.RECORD_CATCH: {
      // Bumps the counter; also stores a masked-only history entry when the
      // user has opted into catch history (storage.recordCatch validates).
      const rec = deps.recordCatch || recordCatch;
      return rec(msg.findings);
    }
    case MSG.RECORD_OUTCOME: {
      const bumpOut = deps.bumpOutcome || bumpOutcome;
      const outcomes = await bumpOut(msg.action);
      return outcomes ? { outcomes } : { ok: false, error: 'invalid_action' };
    }
    case MSG.MUTE_CATEGORY: {
      const mute = deps.muteCategory || muteCategory;
      const settings = await mute(msg.category);
      await broadcast(settings);
      return settings;
    }
    case MSG.EXTRACT_PDF: {
      const extract = deps.extractPdf || extractPdfViaOffscreen;
      try {
        return { text: await extract(msg.dataB64) };
      } catch (e) {
        return { error: String(e) };
      }
    }
    default:
      return { ok: false, error: 'unknown_message' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Defense-in-depth: only accept messages originating from THIS extension
  // (our content scripts / popup / onboarding / secure-composer iframe). Reject
  // anything else.
  if (sender && sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'forbidden_sender' });
    return false;
  }
  // Shield Mode relay: the secure-composer iframe is an extension page embedded
  // in the provider tab, so sender.tab identifies the originating tab. Relay
  // the approved text to THAT tab's content script — it never travels through
  // the provider page's window object.
  if (msg && (msg.type === MSG.SHIELD_SUBMIT || msg.type === MSG.SHIELD_CANCEL) && sender.tab && sender.tab.id != null) {
    const relay =
      msg.type === MSG.SHIELD_SUBMIT
        ? { type: MSG.SHIELD_INJECT, text: String(msg.text || ''), send: !!msg.send, nonce: msg.nonce }
        : { type: MSG.SHIELD_CANCEL, nonce: msg.nonce };
    chrome.tabs.sendMessage(sender.tab.id, relay).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  routeMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the channel open for the async response
});
