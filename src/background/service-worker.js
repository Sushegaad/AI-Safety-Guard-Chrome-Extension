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
import { rewrite, localRewrite } from '../content/rewriter.js';
import { DEFAULT_REWRITE_ENDPOINT } from '../shared/constants.js';

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
    case MSG.REWRITE: {
      // Default: generalize ON-DEVICE (no network). A cloud call happens only
      // when the user has configured a CUSTOM endpoint, and then only with
      // consent. Any network egress runs here in the background (not the content
      // script) so it is not subject to the host page's CSP, and the endpoint
      // comes from trusted storage, never from the caller.
      const settings = await read();
      const endpoint = settings.rewriteApiEndpoint;
      const useCloud = endpoint && endpoint !== DEFAULT_REWRITE_ENDPOINT;
      const local = deps.localRewrite || localRewrite;
      if (useCloud) {
        if (!settings.allowRewrite) return { error: 'consent_required' };
        const doRewrite = deps.rewrite || rewrite;
        try {
          const out = await doRewrite(msg.prompt, msg.categories, { endpoint });
          return { safeText: out.safeText, removed: out.removed, mode: 'cloud' };
        } catch {
          // fall through to on-device generalization
        }
      }
      const out = local(msg.prompt);
      return { safeText: out.safeText, removed: out.removed, mode: 'local' };
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
