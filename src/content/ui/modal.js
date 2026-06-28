/* ============================================================================
 * AI Safety Guard — Screen A2: Pre-Submit Warning Modal (the centerpiece)
 * ----------------------------------------------------------------------------
 * Appears when the user tries to send and the risk meets the sensitivity
 * threshold. Owns a single shadow-root overlay shared by A2 → B1 (redact).
 *
 * Only MASKED values are ever rendered — the raw secret never enters the DOM.
 * ========================================================================== */

import { createShadowHost } from './shadow-style.js';
import { RISK } from '../../shared/constants.js';
import { h, riskClass } from '../../shared/h.js';
import { renderRedactReview } from './redact-review.js';

export function createModal(doc = document) {
  let host = null;
  let root = null;
  let card = null;
  let ctx = null; // { result, text, services }
  let prevFocus = null; // element focused before the modal opened

  function mount() {
    prevFocus = doc.activeElement;
    const created = createShadowHost(doc, 'asg-modal-host');
    host = created.host;
    root = created.root;
    const overlay = h('div.asg-overlay', {
      onclick: (e) => {
        if (e.target === overlay) close(); // scrim click = Keep editing
      },
    });
    // Dialog semantics so assistive tech announces the interstitial and so a
    // keyboard user is trapped inside it (this screen's whole job is "stop & read").
    card = h('div.asg-card', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'AI Safety Guard',
      tabindex: '-1',
    });
    overlay.appendChild(card);
    root.appendChild(overlay);
    doc.body.appendChild(host);
    doc.addEventListener('keydown', onKey, true);
  }

  function focusables() {
    return [...card.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled')
    );
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return;
      const active = (root && root.activeElement) || doc.activeElement;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function setBody(bodyNode) {
    card.textContent = '';
    card.appendChild(head());
    card.appendChild(bodyNode);
    // Move focus into the dialog (first actionable control, else the card).
    const list = focusables();
    (list[0] || card).focus();
  }

  function head() {
    return h('div.asg-card__head', {}, [
      h('span.asg-wordmark', {}, [h('span.asg-wordmark__dot'), 'AI Safety Guard']),
      h('button.asg-x', { text: '×', 'aria-label': 'Close', onclick: close }),
    ]);
  }

  /* ---------------------------- A2: warning ----------------------------- */
  function renderWarning() {
    const body = h('div.asg-card__body');
    body.appendChild(h('h2.asg-title', { text: 'Before you send this' }));
    body.appendChild(
      h('p.asg-subtitle', {
        text:
          'This message looks like it contains private information. ' +
          'Sending it to an AI tool could expose confidential data.',
      })
    );

    const findings = h('div.asg-findings');
    for (const m of ctx.result.matches.filter((x) => x.showInModal)) {
      findings.appendChild(
        h('div.asg-find', {}, [
          h('span.asg-find__type', { text: m.type }),
          h('span.asg-find__val.asg-data', { text: m.maskedValue }),
          h('span.asg-pill.asg-pill--' + riskClass(m.risk), { text: RISK[m.risk].pillLabel }),
        ])
      );
    }
    body.appendChild(findings);

    body.appendChild(
      h('div.asg-note', {}, ['Scanned on your device. Nothing has been sent or stored.'])
    );

    const actions = h('div.asg-actions', {}, [
      h('button.asg-btn.asg-btn--primary', { text: 'Redact sensitive data', onclick: handleRedact }),
      h('div.asg-row', {}, [
        h('button.asg-btn.asg-btn--link', {
          text: 'Send anyway',
          onclick: () => {
            ctx.services.submit();
            close();
          },
        }),
        h('button.asg-btn.asg-btn--link', { text: 'Keep editing', onclick: close }),
      ]),
    ]);
    body.appendChild(actions);
    setBody(body);
  }

  /* ----------------------------- B1: redact ----------------------------- */
  function handleRedact() {
    const { redactedText } = ctx.services.redact(ctx.text, ctx.result.matches);
    ctx.services.applyText(redactedText);
    const rescan = ctx.services.rescan(redactedText);
    const isSafe = rescan.riskLevel === 'safe';
    setBody(
      renderRedactReview({
        redactedText,
        isSafe,
        onLooksGood: () => {
          ctx.services.submit();
          close();
        },
        onUndo: () => {
          ctx.services.applyText(ctx.text); // restore original exactly
          renderWarning();
        },
      })
    );
  }

  /* ---------------------- File attachment warning ----------------------- */
  // A non-blocking nudge (Tier 0) or a findings warning (Tier 1) for attached
  // files. Files can't be redacted in place, so the action is informational.
  function renderFile(opts) {
    const body = h('div.asg-card__body');
    body.appendChild(h('h2.asg-title', { text: opts.title }));
    if (opts.subtitle) body.appendChild(h('p.asg-subtitle', { text: opts.subtitle }));

    const findings = (opts.findings || []).filter((m) => m.showInModal);
    if (findings.length) {
      const list = h('div.asg-findings');
      for (const m of findings) {
        list.appendChild(
          h('div.asg-find', {}, [
            h('span.asg-find__type', { text: m.type }),
            h('span.asg-find__val.asg-data', { text: m.maskedValue }),
            h('span.asg-pill.asg-pill--' + riskClass(m.risk), { text: RISK[m.risk].pillLabel }),
          ])
        );
      }
      body.appendChild(list);
    }

    body.appendChild(
      h('div.asg-note', {}, [
        opts.note || 'Scanned on your device. The file was not uploaded by us.',
      ])
    );
    body.appendChild(
      h('div.asg-actions', {}, [
        h('button.asg-btn.asg-btn--primary', { text: 'Got it', onclick: close }),
      ])
    );
    setBody(body);
  }

  function openFile(opts) {
    ctx = { onClose: opts.onClose };
    if (!host) mount();
    renderFile(opts);
  }

  /* ------------------------------- lifecycle ---------------------------- */
  function open(opts) {
    ctx = opts;
    if (!host) mount();
    if (ctx.services.onCatch) ctx.services.onCatch(ctx.result);
    renderWarning();
  }

  let closing = false;
  function close() {
    if (closing) return; // idempotent — guards double-fire (e.g. submit + scrim)
    closing = true;
    if (host) {
      doc.removeEventListener('keydown', onKey, true);
      host.remove();
      host = root = card = null;
    }
    const onClose = ctx && ctx.onClose;
    ctx = null;
    // Restore focus to wherever the user was (usually the input box).
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try {
        prevFocus.focus();
      } catch {
        /* element may be gone after SPA nav */
      }
    }
    prevFocus = null;
    if (onClose) onClose();
    closing = false;
  }

  return { open, openFile, close, isOpen: () => !!host };
}
