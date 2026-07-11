/* ============================================================================
 * AI Safety Guard — Toolbar Popup (Screen D)
 * ----------------------------------------------------------------------------
 * Reads live settings from the service worker, renders the controls, and
 * persists every change immediately (no Save button) via SET_SETTINGS.
 * ========================================================================== */

import { MSG, withDefaults, shouldShowNoiseHint } from '../shared/storage.js';
import { SENSITIVITY } from '../shared/constants.js';
import { CATEGORY } from '../content/detector.js';
import { normalizeHostname, originFor } from '../shared/domains.js';
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
    const seg = el('div.segmented', { role: 'group', 'aria-label': 'Sensitivity' });
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

    // custom domains (experimental) — per-site permission requested on add
    const input = el('input.domain-add__input', {
      type: 'text',
      placeholder: '+ Add a custom AI domain',
      'aria-label': 'Add a custom AI domain (experimental)',
    });
    const domainStatus = el('p.domain-status', { role: 'status', 'aria-live': 'polite' });
    const setStatus = (msg, isError) => {
      domainStatus.textContent = msg || '';
      domainStatus.classList.toggle('domain-status--error', !!isError);
    };
    const addDomain = () => {
      const { host, error } = normalizeHostname(input.value);
      if (error) {
        setStatus(error, true);
        return;
      }
      if (settings.customDomains.includes(host)) {
        setStatus('Already added.', false);
        input.value = '';
        return;
      }
      // chrome.permissions.request MUST be the first async call in the click
      // handler (user-gesture requirement) — no await before it. Outside a
      // real extension context (tests), treat the grant as given.
      const request =
        typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request
          ? chrome.permissions.request({ origins: [originFor(host)] })
          : Promise.resolve(true);
      Promise.resolve(request)
        .then((granted) => {
          if (!granted) {
            setStatus(`Permission declined — ${host} was not added.`, true);
            return;
          }
          input.value = '';
          setStatus(`Watching ${host}. Reload any open ${host} tabs once.`, false);
          // The service worker owns registration: persisting customDomains
          // triggers its reconcile (register script for the granted origin).
          return persist({ customDomains: [...settings.customDomains, host] });
        })
        .catch(() => setStatus('Chrome refused the permission request. Try again.', true));
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addDomain();
    });
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
        el('p.section__hint', {
          text: 'Custom domains (experimental): Chrome will ask permission for that site only.',
        }),
        domainAdd,
        domainStatus,
        chips,
      ])
    );

    // --- Shield Mode (per-site private composer) --------------------------
    const shieldRows = POPUP_SITES.map((s) =>
      el('label.toggle-row', {}, [
        el('span.toggle-row__label', { text: s.label }),
        el('input.switch', {
          type: 'checkbox',
          'data-shield': s.id,
          checked: !!(settings.shieldMode && settings.shieldMode[s.id]),
          onchange: (e) =>
            persist({ shieldMode: { ...(settings.shieldMode || {}), [s.id]: e.target.checked } }),
        }),
      ])
    );
    body.appendChild(
      el('div.section', {}, [
        el('p.section__label', { text: 'Shield Mode (experimental)' }),
        el('p.section__hint', {
          text: 'Type inside a private box this site can’t read; only approved text reaches it. Off by default.',
        }),
        ...shieldRows,
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

    // --- Muted categories ("don't warn again") with an unmute control ------
    const muted = (settings.disabledCategories || []).filter((c) => CATEGORY[c]);
    if (muted.length) {
      body.appendChild(
        el('div.section', {}, [
          el('p.section__label', { text: 'Muted warnings' }),
          ...muted.map((c) =>
            el('label.toggle-row', {}, [
              el('span.toggle-row__label', { text: CATEGORY[c].type }),
              el('button.asg-btn.asg-btn--secondary', {
                type: 'button',
                'data-unmute': c,
                text: 'Unmute',
                'aria-label': `Unmute ${CATEGORY[c].type} warnings`,
                onclick: () =>
                  persist({
                    disabledCategories: (settings.disabledCategories || []).filter((x) => x !== c),
                  }),
              }),
            ])
          ),
        ])
      );
    }

    // --- Noise hint: the outcome counters, actually consumed --------------
    if (shouldShowNoiseHint(settings)) {
      body.appendChild(
        el('div.hint', { role: 'status' }, [
          el('p.hint__text', {
            text:
              'You send most warnings anyway. If they feel noisy, try Basic mode, ' +
              'or mute the categories you don’t care about from the warning itself.',
          }),
          el('button.asg-btn.asg-btn--link', {
            type: 'button',
            'data-hint-dismiss': '1',
            text: 'Got it',
            onclick: () => persist({ noiseHintDismissed: true }),
          }),
        ])
      );
    }

    // --- Recent catches (optional, local-only, masked values) -------------
    body.appendChild(
      el('div.section', {}, [
        el('p.section__label', { text: 'Catch history' }),
        el('label.toggle-row', {}, [
          el('span.toggle-row__label', { text: 'Keep a local history of catches' }),
          el('input.switch', {
            type: 'checkbox',
            'data-setting': 'catchHistory',
            checked: settings.catchHistory === true,
            onchange: (e) => persist({ catchHistory: e.target.checked }),
          }),
        ]),
        ...(settings.catchHistory && (settings.recentCatches || []).length
          ? [
              ...(settings.recentCatches || []).slice(0, 20).map((c) =>
                el('div.catch-row', {}, [
                  el('span.catch-row__time', {
                    text: new Date(c.t).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  }),
                  el('span.catch-row__items.asg-data', {
                    text: (c.items || [])
                      .map((i) => `${CATEGORY[i.category] ? CATEGORY[i.category].type : i.category} ${i.masked}`)
                      .join(' · '),
                  }),
                ])
              ),
              el('button.asg-btn.asg-btn--secondary', {
                type: 'button',
                'data-clear-history': '1',
                text: 'Clear history',
                onclick: () => persist({ recentCatches: [] }),
              }),
            ]
          : settings.catchHistory
            ? [el('p.section__hint', { text: 'Nothing recorded yet — catches will appear here, masked.' })]
            : [el('p.section__hint', { text: 'Off by default. Stored on this device only, masked values only.' })]),
      ])
    );

    // --- Stat (all local — never uploaded) ---
    const outcomes = settings.outcomes || {};
    body.appendChild(
      el('div.stat', {}, [
        el('span.stat__num', { text: String(settings.riskySubmissionsCaught || 0) }),
        el('span.stat__caption', { text: ' risky sends caught' }),
        ...(outcomes.redacted || outcomes.sentAnyway
          ? [
              el('span.stat__split', {
                text: ` · ${outcomes.redacted || 0} redacted · ${outcomes.sentAnyway || 0} sent anyway`,
              }),
            ]
          : []),
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
