/* ChatGPT adapter — chatgpt.com / chat.openai.com */
import { makeAdapter } from './adapter-base.js';

export default makeAdapter({
  id: 'chatgpt',
  input: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[data-id]', 'main textarea'],
  submit: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'form button[type="submit"]',
  ],
  badgeAnchor: ['form', '#prompt-textarea', 'div[contenteditable="true"]'],
});
