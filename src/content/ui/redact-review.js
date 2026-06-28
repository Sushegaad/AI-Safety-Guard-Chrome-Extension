/* ============================================================================
 * AI Safety Guard — Screen B1: Redact & Review
 * ----------------------------------------------------------------------------
 * Reached from A2 "Redact sensitive data". The input has been rewritten in place
 * with [TYPE] label chips; this panel lets the user read it over, then send.
 * "Looks good — send" is enabled only once a re-scan confirms the text is Safe.
 * "Undo" restores the original text exactly.
 * ========================================================================== */

import { h } from './h.js';

// Render the redacted string with [LABEL] tokens shown as chips.
function renderRedactedText(text) {
  const parts = String(text).split(/(\[[A-Z_]+\])/g);
  const frag = h('div.asg-redacted');
  for (const p of parts) {
    if (/^\[[A-Z_]+\]$/.test(p)) frag.appendChild(h('span.asg-chip', { text: p }));
    else if (p) frag.appendChild(document.createTextNode(p));
  }
  return frag;
}

export function renderRedactReview({ redactedText, isSafe, onLooksGood, onUndo }) {
  const body = h('div.asg-card__body');

  body.appendChild(
    h('div.asg-note', {}, [
      h('span.asg-pill.asg-pill--safe', { text: 'Safe' }),
      'Redacted — ready to review',
    ])
  );
  body.appendChild(
    h('p.asg-subtitle', {
      text: 'We replaced sensitive values with labels. Read it over, then send.',
    })
  );
  body.appendChild(renderRedactedText(redactedText));

  const send = h('button.asg-btn.asg-btn--primary', { text: 'Looks good — send' });
  if (!isSafe) {
    send.setAttribute('disabled', 'true');
    send.style.opacity = '0.5';
    send.style.cursor = 'not-allowed';
  } else {
    send.addEventListener('click', onLooksGood);
  }

  const actions = h('div.asg-actions', {}, [send]);
  actions.appendChild(
    h('div.asg-row', {}, [
      h('span'),
      h('button.asg-btn.asg-btn--link', { text: 'Undo', onclick: onUndo }),
    ])
  );
  body.appendChild(actions);
  return body;
}
