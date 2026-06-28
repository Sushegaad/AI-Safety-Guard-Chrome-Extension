/* ============================================================================
 * AI Safety Guard — Site adapter dispatcher
 * Maps the current hostname to the right adapter. Custom domains (added by the
 * user in settings) fall back to a generic adapter.
 * ========================================================================== */

import chatgpt from './chatgpt.js';
import claude from './claude.js';
import gemini from './gemini.js';
import perplexity from './perplexity.js';
import copilot from './copilot.js';
import { makeAdapter } from './adapter-base.js';

const generic = makeAdapter({
  id: 'custom',
  input: ['div[contenteditable="true"]', 'textarea[placeholder]', 'main textarea', 'textarea'],
  submit: ['button[type="submit"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]'],
});

const BY_HOST = [
  [/(^|\.)chatgpt\.com$/, chatgpt],
  [/(^|\.)chat\.openai\.com$/, chatgpt],
  [/(^|\.)claude\.ai$/, claude],
  [/(^|\.)gemini\.google\.com$/, gemini],
  [/(^|\.)perplexity\.ai$/, perplexity],
  [/(^|\.)copilot\.microsoft\.com$/, copilot],
];

export const ADAPTERS = { chatgpt, claude, gemini, perplexity, copilot };

/** Resolve the adapter for a hostname (default: current location host). */
export function getAdapter(host = location.hostname) {
  for (const [re, adapter] of BY_HOST) {
    if (re.test(host)) return adapter;
  }
  return generic;
}
