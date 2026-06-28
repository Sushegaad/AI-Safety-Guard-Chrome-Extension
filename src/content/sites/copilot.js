/* Microsoft Copilot adapter — copilot.microsoft.com */
import { makeAdapter } from './adapter-base.js';

export default makeAdapter({
  id: 'copilot',
  input: ['textarea#userInput', 'textarea[placeholder]', 'div[contenteditable="true"]', 'main textarea'],
  submit: ['button[type="submit"]', 'button[aria-label="Submit"]', 'button[title="Submit"]'],
  badgeAnchor: ['textarea#userInput', 'textarea[placeholder]', 'div[contenteditable="true"]'],
});
