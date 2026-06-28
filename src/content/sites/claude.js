/* Claude adapter — claude.ai */
import { makeAdapter } from './adapter-base.js';

export default makeAdapter({
  id: 'claude',
  input: ['div[contenteditable="true"]', 'div.ProseMirror[contenteditable="true"]', 'fieldset div[contenteditable]'],
  submit: [
    'button[aria-label="Send message"]',
    'button[aria-label="Send Message"]',
    'button[type="submit"]',
  ],
  badgeAnchor: ['fieldset', 'div[contenteditable="true"]'],
});
