/* Perplexity adapter — www.perplexity.ai */
import { makeAdapter } from './adapter-base.js';

export default makeAdapter({
  id: 'perplexity',
  input: ['textarea[placeholder]', 'textarea[data-testid="search-input"]', 'main textarea', 'div[contenteditable="true"]'],
  submit: ['button[aria-label="Submit"]', 'button[aria-label="Submit Search"]', 'button[type="submit"]'],
  badgeAnchor: ['textarea[placeholder]', 'main textarea'],
});
