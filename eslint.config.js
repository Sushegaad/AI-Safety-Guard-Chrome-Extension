// ESLint 9 flat config. ecmaVersion 'latest' enables import attributes
// (`import RULES from './rules.json' with { type: 'json' }`) used by detector.js.
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        __webpack_public_path__: 'writable', // webpack runtime public path (set for lazy chunks)
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // Node-context files: test runner and build config.
    files: ['**/*.test.mjs', 'webpack.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Token-enforcement gate: no hardcoded hex colors or 600/700 font weights
    // in JS. Colors/weights MUST come from constants.js (which is exempt below).
    files: ['src/**/*.js'],
    ignores: ['src/shared/constants.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Hardcoded hex color in JS — use a token from constants.js, not a literal.',
        },
        {
          selector: 'Literal[value=600]',
          message: 'Hardcoded font-weight 600 — only 400/500 via constants.FONTS.weight.',
        },
        {
          selector: 'Literal[value=700]',
          message: 'Hardcoded font-weight 700 — only 400/500 via constants.FONTS.weight.',
        },
        {
          // CSS-in-JS lives in template literals (shadow-style.js). The Literal
          // selectors above miss those, so also scan template chunks for raw
          // hex colors and 600/700 font-weights.
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]',
          message: 'Hardcoded hex color in template literal — use a token from constants.js.',
        },
        {
          selector: 'TemplateElement[value.raw=/font-weight:\\s*(600|700)/]',
          message: 'Hardcoded font-weight 600/700 in template literal — use constants.FONTS.weight.',
        },
      ],
    },
  },
];
