/* ============================================================================
 * AI Safety Guard — Supported-site registry (single source of truth)
 * ----------------------------------------------------------------------------
 * Everything about a supported AI site lives here once: its id, label, the
 * onboarding group it belongs to, whether it appears in the popup, the host(s)
 * it runs on, and its DOM selectors. The adapters, dispatcher, popup,
 * onboarding, storage defaults, and the manifest (verified by a drift test) all
 * derive from this list. Adding a site = one entry here.
 *
 * `hosts` are the exact hostnames used in the manifest match patterns.
 * Selectors list a PRIMARY plus FALLBACKS (tried in order).
 * ========================================================================== */

export const SITES = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    selectorVersion: 1, // bump on every selector edit + add a CHANGELOG line
    inPopup: true,
    hosts: ['chatgpt.com', 'chat.openai.com'],
    selectors: {
      input: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[data-id]', 'main textarea'],
      submit: [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-send-button"]',
        '#composer-submit-button',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send" i]',
        'form button[type="submit"]',
      ],
      badgeAnchor: ['form', '#prompt-textarea', 'div[contenteditable="true"]'],
    },
  },
  {
    id: 'claude',
    label: 'Claude',
    selectorVersion: 1, // bump on every selector edit + add a CHANGELOG line
    inPopup: true,
    hosts: ['claude.ai'],
    selectors: {
      input: [
        'div[contenteditable="true"]',
        'div.ProseMirror[contenteditable="true"]',
        'fieldset div[contenteditable]',
      ],
      submit: [
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
        'button[type="submit"]',
      ],
      badgeAnchor: ['fieldset', 'div[contenteditable="true"]'],
    },
  },
  {
    id: 'gemini',
    label: 'Gemini',
    selectorVersion: 1, // bump on every selector edit + add a CHANGELOG line
    inPopup: true,
    hosts: ['gemini.google.com'],
    selectors: {
      input: [
        'div[contenteditable="true"].ql-editor',
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
      ],
      submit: ['button.send-button', 'button[aria-label="Send message"]', 'button[mattooltip="Submit"]'],
      badgeAnchor: ['rich-textarea', 'div[contenteditable="true"].ql-editor'],
    },
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    selectorVersion: 1, // bump on every selector edit + add a CHANGELOG line
    inPopup: true,
    hosts: ['www.perplexity.ai'],
    selectors: {
      input: ['textarea[placeholder]', 'textarea[data-testid="search-input"]', 'main textarea', 'div[contenteditable="true"]'],
      submit: ['button[aria-label="Submit"]', 'button[aria-label="Submit Search"]', 'button[type="submit"]'],
      badgeAnchor: ['textarea[placeholder]', 'main textarea'],
    },
  },
  {
    id: 'copilot',
    label: 'Microsoft Copilot',
    selectorVersion: 1, // bump on every selector edit + add a CHANGELOG line
    inPopup: false,
    hosts: ['copilot.microsoft.com'],
    selectors: {
      input: ['textarea#userInput', 'textarea[placeholder]', 'div[contenteditable="true"]', 'main textarea'],
      submit: ['button[type="submit"]', 'button[aria-label="Submit"]', 'button[title="Submit"]'],
      badgeAnchor: ['textarea#userInput', 'textarea[placeholder]', 'div[contenteditable="true"]'],
    },
  },
];

export const SITE_IDS = SITES.map((s) => s.id);

/** Default enabledSites map ({ id: true }) for the settings schema. */
export function defaultEnabledSites() {
  return Object.fromEntries(SITE_IDS.map((id) => [id, true]));
}

/** Manifest match patterns derived from the registry (https://host/*). */
export function manifestMatchPatterns() {
  return SITES.flatMap((s) => s.hosts).map((host) => `https://${host}/*`);
}

/** Find the registry entry for a hostname (exact or subdomain match). */
export function siteForHost(hostname) {
  return SITES.find((s) => s.hosts.some((h) => hostname === h || hostname.endsWith('.' + h))) || null;
}
