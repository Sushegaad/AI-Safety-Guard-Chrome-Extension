/* ============================================================================
 * AI Safety Guard — First-Run Onboarding (Screen E)
 * ----------------------------------------------------------------------------
 * 3 steps: intro → sensitivity → sites. On "Start protecting me" we persist the
 * chosen settings (via the service worker) with onboardingComplete:true and
 * close the tab. Site toggles are grouped per the design: ChatGPT (standalone),
 * Claude & Gemini, Perplexity & Copilot.
 * ========================================================================== */

import { MSG } from '../shared/storage.js';
import { SENSITIVITY, DEFAULT_SENSITIVITY } from '../shared/constants.js';
import { SITES } from '../shared/sites.js';
import { h as el } from '../shared/h.js';

export function initOnboarding(opts = {}) {
  const doc = opts.doc || document;
  const send = opts.send || ((m) => chrome.runtime.sendMessage(m));
  const onDone = opts.onDone || (() => window.close());
  const root = doc.getElementById('onboarding');

  const state = {
    step: 1,
    sensitivity: DEFAULT_SENSITIVITY,
    // One entry per provider, all on by default (Design v1, updated Screen E).
    sites: Object.fromEntries(SITES.map((s) => [s.id, true])),
    customDomains: [],
  };

  function meta(n) {
    return el('div.step-meta', { text: `Step ${n} of 3` });
  }

  function step1() {
    return [
      meta(1),
      el('h1', { text: 'A safety net for AI' }),
      el('div.benefit', {}, [el('span.tick', { text: '✓' }), 'Scans on your device']),
      el('div.benefit', {}, [el('span.tick', { text: '✓' }), 'Nothing stored, ever']),
      el('div.benefit', {}, [el('span.tick', { text: '✓' }), "You're always in control"]),
      el('button.asg-btn.asg-btn--primary.cta', {
        type: 'button',
        text: 'Continue',
        onclick: () => go(2),
      }),
    ];
  }

  function step2() {
    const cards = Object.values(SENSITIVITY).map((mode) => {
      const selected = state.sensitivity === mode.id;
      return el('div' + (selected ? '.opt-card.opt-card--selected' : '.opt-card'), {
        role: 'button',
        'data-mode': mode.id,
        onclick: () => {
          state.sensitivity = mode.id;
          render();
        },
      }, [
        el('div.opt-card__name', {}, [
          mode.label,
          mode.recommended ? el('span.opt-card__rec', { text: 'Recommended' }) : null,
        ]),
        el('div.opt-card__desc', { text: mode.description }),
      ]);
    });
    return [
      meta(2),
      el('h1', { text: 'How careful should we be?' }),
      el('p.sub', { text: 'You can change this anytime.' }),
      ...cards,
      el('button.asg-btn.asg-btn--primary.cta', {
        type: 'button',
        text: 'Continue',
        onclick: () => go(3),
      }),
    ];
  }

  function siteToggle(label, id) {
    return el('label.toggle-row', {}, [
      el('span.toggle-row__label', { text: label }),
      el('input.switch', {
        type: 'checkbox',
        'data-site': id,
        checked: state.sites[id],
        onchange: (e) => {
          state.sites[id] = e.target.checked;
        },
      }),
    ]);
  }

  function step3() {
    const domain = el('input.domain-input', {
      type: 'text',
      placeholder: '+ Add a custom domain',
      'aria-label': 'Add a custom domain',
    });
    return [
      meta(3),
      el('h1', { text: 'Where should we watch?' }),
      el('p.sub', { text: 'On by default for the major AI tools.' }),
      ...SITES.map((s) => siteToggle(s.label, s.id)),
      domain,
      el('button.asg-btn.asg-btn--primary.cta', {
        type: 'button',
        text: 'Start protecting me',
        onclick: () => finish(domain.value),
      }),
    ];
  }

  function go(n) {
    state.step = n;
    render();
  }

  async function finish(domainValue) {
    const enabledSites = { ...state.sites };
    const customDomains = [];
    const v = (domainValue || '').trim().toLowerCase().replace(/^https?:\/\//, '');
    if (v) customDomains.push(v);

    await send({
      type: MSG.SET_SETTINGS,
      patch: {
        sensitivity: state.sensitivity,
        enabledSites,
        customDomains,
        onboardingComplete: true,
      },
    });
    onDone();
  }

  function render() {
    root.textContent = '';
    const view = state.step === 1 ? step1() : state.step === 2 ? step2() : step3();
    for (const node of view) if (node) root.appendChild(node);
  }

  render();
  return { render, getState: () => state, finish };
}

// Auto-init only as a real extension page (where chrome.runtime.sendMessage
// exists). Tests import the module and call initOnboarding() with injected deps.
if (
  typeof document !== 'undefined' &&
  document.getElementById('onboarding') &&
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.runtime.sendMessage === 'function'
) {
  initOnboarding();
}
