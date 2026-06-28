/* ============================================================================
 * AI Safety Guard — Toolbar Popup (Screen D)
 * ----------------------------------------------------------------------------
 * Reads live settings from the service worker, renders the controls, and
 * persists every change immediately (no Save button) via SET_SETTINGS.
 * ========================================================================== */

import { MSG, withDefaults } from '../shared/storage.js';
import { SENSITIVITY } from '../shared/constants.js';
import { SITES } from '../shared/sites.js';
import { logoDataUri } from '../shared/logo.js';
import { h as el } from '../shared/h.js';

// Site toggles shown in the popup, derived from the registry (Design v1 D).
const POPUP_SITES = SITES.filter((s) => s.inPopup).map((s) => ({ id: s.id, label: s.label }));

export function initPopup(opts = {}) {
  const doc = opts.doc || document;
  const send = opts.send || ((m) => chrome.runtime.sendMessage(m));
  const body = doc.getElementById('popup-body');
  let settings = withDefaults({});

  async function persist(patch) {
    settings = withDefaults({ ...settings, ...patch });
    render();
    const fresh = await send({ type: MSG.SET_SETTINGS, patch });
    if (fresh && typeof fresh === 'object' && !fresh.error) {
      settings = withDefaults(fresh);
      render();
    }
  }

  function render() {
    body.textContent = '';

    // Brand mark in the header (shield + keyhole), from the single logo source.
    const dot = doc.querySelector('.wordmark__dot');
    if (dot) dot.style.background = `url("${logoDataUri()}") center / contain no-repeat`;

    // --- Sensitivity ---
    const seg = el('div.segmented');
    for (const mode of Object.values(SENSITIVITY)) {
      seg.appendChild(
        el('button.segmented__btn', {
          type: 'button',
          'aria-pressed': String(settings.sensitivity === mode.id),
          'data-mode': mode.id,
          onclick: () => persist({ sensitivity: mode.id }),
          text: mode.label,
        })
      );
    }
    body.appendChild(el('div.section', {}, [el('p.section__label', { text: 'Sensitivity' }), seg]));

    // --- Watch these sites ---
    const siteRows = POPUP_SITES.map((s) =>
      el('label.toggle-row', {}, [
        el('span.toggle-row__label', { text: s.label }),
        el('input.switch', {
          type: 'checkbox',
          'data-site': s.id,
          checked: settings.enabledSites[s.id] !== false,
          onchange: (e) =>
            persist({ enabledSites: { ...settings.enabledSites, [s.id]: e.target.checked } }),
        }),
      ])
    );

    // custom domains
    const input = el('input.domain-add__input', {
      type: 'text',
      placeholder: '+ Add a custom AI domain',
      'aria-label': 'Add a custom AI domain',
    });
    const addDomain = () => {
      const v = (input.value || '').trim().toLowerCase().replace(/^https?:\/\//, '');
      if (v && !settings.customDomains.includes(v)) {
        persist({ customDomains: [...settings.customDomains, v] });
      }
      input.value = '';
    };
    const domainAdd = el('div.domain-add', {}, [
      input,
      el('button.asg-btn.asg-btn--secondary', { type: 'button', text: 'Add', onclick: addDomain }),
    ]);
    const chips = el(
      'div',
      {},
      settings.customDomains.map((d) =>
        el('span.domain-chip', {}, [
          d,
          el('button', {
            type: 'button',
            'aria-label': `Remove ${d}`,
            text: '×',
            onclick: () =>
              persist({ customDomains: settings.customDomains.filter((x) => x !== d) }),
          }),
        ])
      )
    );

    body.appendChild(
      el('div.section', {}, [
        el('p.section__label', { text: 'Watch these sites' }),
        ...siteRows,
        domainAdd,
        chips,
      ])
    );

    // --- Attachments ---
    body.appendChild(
      el('div.section', {}, [
        el('p.section__label', { text: 'Attachments' }),
        el('label.toggle-row', {}, [
          el('span.toggle-row__label', { text: 'Scan attached PDF & Word files' }),
          el('input.switch', {
            type: 'checkbox',
            'data-setting': 'scanAttachments',
            checked: settings.scanAttachments !== false,
            onchange: (e) => persist({ scanAttachments: e.target.checked }),
          }),
        ]),
      ])
    );

    // --- Stat ---
    body.appendChild(
      el('div.stat', {}, [
        el('span.stat__num', { text: String(settings.riskySubmissionsCaught || 0) }),
        el('span.stat__caption', { text: ' risky sends caught' }),
      ])
    );
  }

  // Load current settings, then render.
  Promise.resolve(send({ type: MSG.GET_SETTINGS }))
    .then((s) => {
      if (s && typeof s === 'object' && !s.error) settings = withDefaults(s);
    })
    .catch(() => {})
    .finally(render);

  return { render, getSettings: () => settings };
}

// Auto-init only as a real extension page (where chrome.runtime.sendMessage
// exists). Tests import the module and call initPopup() with an injected send.
if (
  typeof document !== 'undefined' &&
  document.getElementById('popup-body') &&
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.runtime.sendMessage === 'function'
) {
  initPopup();
}
