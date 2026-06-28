/* Gemini adapter — gemini.google.com */
import { makeAdapter } from './adapter-base.js';

export default makeAdapter({
  id: 'gemini',
  input: ['div[contenteditable="true"].ql-editor', 'div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]'],
  submit: ['button.send-button', 'button[aria-label="Send message"]', 'button[mattooltip="Submit"]'],
  badgeAnchor: ['rich-textarea', 'div[contenteditable="true"].ql-editor'],
});
