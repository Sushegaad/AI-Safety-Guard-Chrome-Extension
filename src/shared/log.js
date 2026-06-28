/* ============================================================================
 * AI Safety Guard — gated diagnostic logging
 * ----------------------------------------------------------------------------
 * Diagnostics (startup, attach, "input not found", selector fallbacks) are
 * helpful while developing but should be silent in the shipped extension so we
 * don't pollute every supported site's console or leak internal state.
 *
 * Flip DEBUG to true locally to surface them. Hard failures (log.error) always
 * print, since a crash is worth surfacing even in production.
 * ========================================================================== */

const DEBUG = false;
const PREFIX = '[AI Safety Guard]';

export const log = {
  debug: (...args) => {
    if (DEBUG) console.debug(PREFIX, ...args);
  },
  info: (...args) => {
    if (DEBUG) console.info(PREFIX, ...args);
  },
  warn: (...args) => {
    if (DEBUG) console.warn(PREFIX, ...args);
  },
  error: (...args) => console.error(PREFIX, ...args),
};
