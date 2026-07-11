# Manual QA — Shield Mode + capability notice

Cross-origin iframe behavior, focus handoff, and the SW relay can't be
exercised in jsdom or the sandbox. Run once against a fresh `npm run build`
loaded unpacked from `dist/`, on a supported site (e.g. chatgpt.com).

## Capability notice (Part A)

- [ ] First focus of the composer on a supported site → one-time notice
      "Before you type here" appears (non-blocking). Dismiss it.
- [ ] Reload the tab → notice does NOT reappear (persisted per site).
- [ ] A different supported site shows its own first-time notice.

## Shield Mode — enable

- [ ] Popup → "Shield Mode (experimental)" → toggle ChatGPT on.
- [ ] Reload the ChatGPT tab. Click the composer → a bordered secure box
      overlays it with the strip "Shield on — your text stays private until you
      send".
- [ ] Type a secret (`sk-live-Ab3dEf6hIj9kLm2n`). Findings appear inside the
      box; the primary button reads "Redact & send safely".

## The boundary (the whole point)

- [ ] With DevTools open on the PROVIDER page, run in its console:
      `document.querySelector('#prompt-textarea')?.innerText` → empty while you
      type in the secure box. The provider box holds nothing.
- [ ] `document.getElementById('asg-shield-frame').contentDocument` → throws /
      null (cross-origin) — the page cannot read into the iframe.

## Approve paths

- [ ] "Insert into chat" → redacted/approved text appears in the real composer;
      overlay closes; nothing sent.
- [ ] Type again, press Enter (or "Redact & send safely") → approved text is
      injected AND the site sends it.
- [ ] Esc or "Cancel" → overlay closes, real composer stays empty, focus
      returns to it.

## Focus race + lifecycle

- [ ] Click the composer and immediately type — the first characters land in
      the secure box, not the provider box (capture-phase handoff).
- [ ] Resize/scroll the window while the overlay is open → it stays positioned
      over the composer.
- [ ] Turn Shield off in the popup, reload → composer behaves normally (badge +
      send interception still work).

## Regression

- [ ] With Shield OFF (default), everything behaves exactly as before —
      badge, warning modal, redaction, custom domains, attachments.
- [ ] Shield interacts correctly with the existing send interception: a plain
      "Insert & send" of risky text still goes through the normal path.
