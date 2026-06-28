/* ============================================================================
 * AI Safety Guard — Background Service Worker (MV3)
 * ----------------------------------------------------------------------------
 * The single owner of chrome.storage reads/writes and the message hub for
 * content scripts / popup / onboarding.
 *
 * MV3 service workers are EPHEMERAL — they shut down when idle. We never hold
 * settings in memory; every handler reads from chrome.storage fresh.
 * ========================================================================== */

import { MSG, readSettings, writeSettings, bumpCatch } from '../shared/storage.js';

/* --- First run: open onboarding ------------------------------------------ */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
});

/* --- Broadcast settings to every content script -------------------------- */
async function broadcastSettings(settings) {
  let tabs = [];
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
  const bump = deps.bumpCatch || bumpCatch;
  const broadcast = deps.broadcast || broadcastSettings;

  switch (msg && msg.type) {
    case MSG.GET_SETTINGS:
      return read();
    case MSG.SET_SETTINGS: {
      const settings = await write(msg.patch || {});
      await broadcast(settings);
      return settings;
    }
    case MSG.RECORD_CATCH: {
      const riskySubmissionsCaught = await bump();
      return { riskySubmissionsCaught };
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
  // (our content scripts / popup / onboarding). Reject anything else.
  if (sender && sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'forbidden_sender' });
    return false;
  }
  routeMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the channel open for the async response
});
