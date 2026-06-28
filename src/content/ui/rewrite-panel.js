/* ============================================================================
 * AI Safety Guard — Screen B2: Rewrite Safely (THE ONLY CLOUD STEP)
 * ----------------------------------------------------------------------------
 * Reached from A2 "Rewrite it safely". Two-column compare of the user's prompt
 * vs an AI-generalized version. Cloud rewrite is OFF by default and gated on
 * explicit consent — no network call happens until the user turns it on.
 * "Back" returns to A2 with no network call if the rewrite was never triggered.
 * ========================================================================== */

import { h } from '../../shared/h.js';

export function renderRewritePanel(props) {
  const {
    original,
    safer, // string | null
    removed, // "Removed: ..."
    mode, // 'local' | 'cloud'
    allowRewrite, // boolean — has consent been granted? (always true for local)
    endpoint,
    busy,
    error,
    onEnableConsent,
    onUseSafer,
    onBack,
  } = props;
  const isLocal = mode !== 'cloud';

  const body = h('div.asg-card__body');
  body.appendChild(h('h2.asg-title', { text: 'A safer way to ask' }));
  body.appendChild(
    h('p.asg-subtitle', { text: 'We generalize the private bits so the AI can still help.' })
  );

  const saferText = busy
    ? 'Generating a safer version…'
    : error
      ? error
      : safer || (allowRewrite ? '…' : 'Turn on cloud rewrite to generate this.');

  body.appendChild(
    h('div.asg-compare', {}, [
      h('div', {}, [
        h('div.asg-col__label', { text: 'Your version' }),
        h('div.asg-col__text', { text: original }),
      ]),
      h('div', {}, [
        h('div.asg-col__label', { text: 'Safer version' }),
        h('div.asg-col__text', { text: saferText }),
      ]),
    ])
  );

  if (removed) body.appendChild(h('p.asg-removed', { text: removed }));

  // Disclosure: on-device by default; cloud only when a custom endpoint is set.
  const disclosure = isLocal
    ? h('div.asg-disclosure', {}, [
        h('div', {}, [
          h('strong', { text: 'Generated on your device. ' }),
          h('span', {
            text: 'No text is sent anywhere. Set a custom endpoint in settings to use a hosted model instead.',
          }),
        ]),
      ])
    : h('div.asg-disclosure', {}, [
        h('div', {}, [
          h('strong', { text: 'Use cloud rewrite · off by default. ' }),
          h('span', {
            text: `Only this text is sent, only when you ask. Endpoint is configurable (${endpoint}).`,
          }),
        ]),
      ]);
  body.appendChild(disclosure);

  const actions = h('div.asg-actions');
  if (!allowRewrite) {
    actions.appendChild(
      h('button.asg-btn.asg-btn--primary', {
        text: 'Turn on cloud rewrite',
        onclick: onEnableConsent,
      })
    );
  } else {
    const use = h('button.asg-btn.asg-btn--primary', { text: 'Use safer version' });
    if (!safer || busy) {
      use.setAttribute('disabled', 'true');
      use.style.opacity = '0.5';
      use.style.cursor = 'not-allowed';
    } else {
      use.addEventListener('click', onUseSafer);
    }
    actions.appendChild(use);
  }
  actions.appendChild(
    h('div.asg-row', {}, [
      h('span'),
      h('button.asg-btn.asg-btn--link', { text: 'Back', onclick: onBack }),
    ])
  );
  body.appendChild(actions);
  return body;
}
