/* ============================================================================
 * AI Safety Guard — generate src/shared/tokens.css from the style source
 * Run: npm run gen:tokens  (also runs automatically on prebuild)
 *
 * constants.js is the single source of token VALUES; shared/styles.js turns
 * them into CSS (cssVars + componentCss). This script writes the page-facing
 * tokens.css from it. Never hand-edit tokens.css — edit constants.js / styles.js.
 * ========================================================================== */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cssVars, componentCss, tokenVars } from '../src/shared/styles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Re-exported for the drift test.
export const rootVars = tokenVars;

export function generateTokensCss() {
  return (
    '/* ============================================================================\n' +
    ' * AI Safety Guard — Design Tokens (GENERATED from constants.js — do not edit)\n' +
    ' * Regenerate with: npm run gen:tokens\n' +
    ' * ==========================================================================*/\n\n' +
    cssVars(':root') +
    '\n' +
    componentCss()
  );
}

if (process.argv[1] && process.argv[1].endsWith('gen-tokens.mjs')) {
  writeFileSync(join(ROOT, 'src/shared/tokens.css'), generateTokensCss());
  console.log('tokens.css generated from constants.js / styles.js');
}
