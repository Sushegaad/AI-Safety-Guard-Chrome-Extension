# AI Safety Guard — Section 508 / WCAG 2.1 AA Accessibility Audit

Date: June 2026 (v1.0.0 audit) with a July 2026 addendum covering the v1.1.0 additions (see "Addendum" at the end). Standard: WCAG 2.1 Level AA, as incorporated by the Revised Section 508 standards (36 CFR Part 1194). Method: manual source review of the user-facing surfaces plus programmatic color-contrast calculation. This is an internal pre-submission audit; it feeds the VPAT/ACR in `VPAT.md`.

## Scope

Three interactive surfaces:

- Toolbar popup, Screen D (`src/popup/popup.html`, `popup.js`, `popup.css`).
- First-run onboarding, Screen E (`src/onboarding/onboarding.html`, `onboarding.js`).
- Pre-send warning modal and redact review, Screens A2/B1 (`src/content/ui/modal.js`, `redact-review.js`), which render inside a shadow root on the AI sites.

The inline risk badge (A1) was not a target but shares the color tokens flagged in Finding 2, so that fix carries over to it.

## Summary

Two findings block a clean "Supports" claim. The rest are minor and mostly about making existing visual structure programmatic. Nothing here is architecturally hard to fix.

| ID | Finding | WCAG SC | Level | Severity |
|----|---------|---------|-------|----------|
| F1 | Onboarding sensitivity cards are not keyboard operable | 2.1.1 Keyboard | A | High (blocker) |
| F2 | Risk-severity pill text below 4.5:1 contrast | 1.4.3 Contrast (Minimum) | AA | High |
| F3 | No focus-visible indicator; off-state toggle boundary below 3:1 | 2.4.7, 1.4.11 | AA | Medium |
| F4 | Dialog name is the brand, not the visible purpose; option state not exposed | 2.4.6, 4.1.2 | AA / A | Medium |
| F5 | Step navigation does not move focus to the new step | 2.4.3 Focus Order | A | Medium |
| F6 | Some groupings/labels not programmatically associated | 1.3.1 Info and Relationships | A | Low |
| F7 | Disabled send button gives no programmatic reason | 3.3.x / advisory | — | Low |

## Findings in detail

### F1 — Onboarding sensitivity options cannot be used with a keyboard (2.1.1, Level A)

In `onboarding.js` (step 2), each sensitivity option is a `div` with `role: 'button'` and an `onclick` handler, but no `tabindex` and no key handler:

```
el('div' + (selected ? '.opt-card.opt-card--selected' : '.opt-card'), {
  role: 'button',
  onclick: () => { state.sensitivity = mode.id; render(); },
}, [...])
```

A keyboard or screen-reader user cannot Tab to these cards and cannot activate them with Enter or Space. Because choosing sensitivity is a required onboarding step, this is a hard Level A failure and the top priority.

Fix: render the option as a real `<button type="button">`, or add `tabindex="0"` plus a `keydown` handler for Enter and Space. Either way, also expose the selected state programmatically (see F4).

### F2 — Risk-severity pill text is below the 4.5:1 minimum (1.4.3, Level AA)

The risk pills (SAFE / MEDIUM / HIGH / CRITICAL) and the "Safe" pill on the redact screen render small uppercase text (11px) using the foreground/background pairs in `constants.js` `RISK`. Measured contrast:

| Pill | Foreground | Background | Ratio | AA (4.5:1) |
|------|-----------|-----------|-------|------------|
| SAFE | #4F7A65 | #E8F0EB | 4.20 | Fail |
| MEDIUM | #94794A | #F3EEDD | 3.55 | Fail |
| HIGH | #B0795A | #F4E9DF | 3.07 | Fail |
| CRITICAL | #AB5A55 | #F4E3E1 | 3.91 | Fail |

These pass the 3:1 bar for large text or non-text UI components, but the pill content is small text, so 4.5:1 applies. Severity is the same information shown in the row label text, so meaning is not lost, but the contrast criterion still fails.

Fix: darken each `fg` token until it reaches 4.5:1 against its `bg` (the desaturated palette can stay; only lightness needs to drop). Because color comes only from `constants.js`, one edit there plus `npm run gen:tokens` updates the popup, onboarding, and shadow UI together. Re-run the contrast check after.

Note: body text, headings, links, primary buttons, the segmented control, chips, and the "recommended" label all pass AA comfortably (4.86:1 to 17:1), so only the risk pills need adjustment.

### F3 — Focus indicator and toggle boundary contrast on custom controls (2.4.7 AA, 1.4.11 AA)

The toggle switches use `appearance: none` (`popup.css` `.switch`, and the inline styles in `onboarding.html`), and neither they nor the token buttons (`.asg-btn`, `.segmented__btn`) define a `:focus-visible` style. They currently inherit the user agent default outline, which is easily lost on a filled control and is not guaranteed across browsers. For a government review this should be explicit.

Separately, the toggle's off-state track is the border token (#E6E4DF) on a white surface, roughly 1.2:1. As a UI-component state boundary this is below the 3:1 required by 1.4.11 Non-text Contrast, so an off toggle can be hard to perceive. (The on-state uses trust blue, which is fine.)

Fix: add a `:focus-visible` outline (for example `outline: 2px solid var(--color-trust); outline-offset: 2px;`) to `.asg-btn`, `.segmented__btn`, `.switch`, the onboarding `.opt-card`, and the modal close button; and darken the off-state toggle track (or add a 3:1 border) so the control boundary is visible.

### F4 — Dialog is named by brand, not purpose; selected option not exposed (2.4.6 AA, 4.1.2 A)

The modal sets `aria-label: 'AI Safety Guard'` (`modal.js`), so a screen reader announces the brand rather than the visible heading "Before you send this." The actual title is an `<h2>` (`.asg-title`) that is not referenced. Separately, the onboarding option cards (F1) convey their selected state only through a CSS class, not through ARIA.

Fix: give the `<h2>` an id and point the dialog at it with `aria-labelledby` instead of a static `aria-label`; the file warning variant should reference its own title. For the options, add `aria-pressed` (button pattern) or `role="radio"` with `aria-checked` in a `role="radiogroup"`.

### F5 — Focus is not managed across onboarding steps (2.4.3, Level A)

`go(n)` swaps the step content with `render()` but does not move focus. The button the user activated is removed from the DOM, so focus falls back to `body`, and a screen-reader user is not told the step changed.

Fix: after each render, move focus to the new step heading (`h1` with `tabindex="-1"`), or expose the step container as a live region. Moving focus to the heading also satisfies the "announce the new context" expectation.

### F6 — Some structure is visual only (1.3.1, Level A)

Minor relationships are not programmatic: the popup sensitivity group has a visible `<p>` label but no `role="group"`/`aria-labelledby`; popup section labels are `<p>` rather than headings and the popup has no `<h1>`; the findings rows in the modal are `div`s rather than list semantics.

Fix: wrap the sensitivity buttons in `role="group"` with `aria-label`; add a visually-hidden `<h1>` or promote section labels to headings; mark the findings container `role="list"` and rows `role="listitem"`.

### F7 — Disabled send button has no programmatic explanation (advisory)

On the redact screen, "Looks good — send" is `disabled` with reduced opacity until the re-scan is clean. The adjacent "Safe / Redacted ready" text provides visual context, but a screen-reader user landing nearby gets no tie between the disabled state and the reason. Low priority; optional `aria-describedby` to the status note resolves it.

## What already conforms (strengths)

- The modal implements a correct dialog: `role="dialog"`, `aria-modal="true"`, a working Tab and Shift+Tab focus trap, Escape to close, focus moved into the dialog on open, and focus restored to the prior element on close (`modal.js`).
- Icon-only controls have text alternatives: the modal close button (`aria-label="Close"`), the remove-domain buttons (`aria-label="Remove ..."`), and the custom-domain inputs (`aria-label`).
- Real semantic controls are used outside F1: native `<button>` elements and native `<input type="checkbox">` toggles wrapped in `<label>`, which are keyboard operable and correctly named.
- Risk is never conveyed by color alone; every pill and badge carries a text label, satisfying 1.4.1 Use of Color.
- Pages declare `lang="en"` and a responsive viewport; body text and headings exceed AA contrast by a wide margin.
- Motion is limited to a 0.12s toggle transition, well under any seizure or distraction threshold.

## Remediation status

All findings below (F1 through F6) were remediated in the current build and are covered by automated jsdom tests (onboarding options are real keyboard-operable buttons exposing `aria-pressed`; the dialog is named by its heading; findings use list semantics). The risk-pill tokens were darkened to 4.63:1 to 4.68:1 and verified programmatically. The full gate (lint, tests, privacy audit, build) passes. The `VPAT.md` conformance levels reflect this remediated build. A manual screen-reader pass (NVDA/VoiceOver) on the live extension remains a good final check before submission.

## Remediation roadmap (completed)

Priority order, with rough effort:

1. F1 keyboard operability of onboarding options — small, do first (it is the only Level A blocker that stops a task).
2. F2 darken the four risk `fg` tokens to 4.5:1, regenerate tokens, re-run contrast — small.
3. F3 add `:focus-visible` outlines — small.
4. F4 `aria-labelledby` on the dialog and `aria-pressed`/radio semantics on options — small.
5. F5 move focus to the step heading on navigation — small.
6. F6 group/list/heading semantics — small, mostly attribute additions.
7. F7 optional `aria-describedby` — trivial.

After these, the VPAT can move F1–F6 from "Partially Supports" to "Supports." Add a jsdom-based test asserting the option cards are focusable and the dialog is labelled by its heading so the gate guards against regressions.

---

## Addendum — v1.1.0 surfaces (July 2026)

Version 1.1.0 added interactive surface after the original audit. Reviewed by the same method (manual source review + contrast check of new styles):

### A1 — Per-finding mute buttons in the warning dialog

Each non-critical finding row gains a "Don't warn about this" button (`.asg-mute`). Assessment: keyboard reachable inside the dialog's existing focus trap; named per category via `aria-label` ("Don't warn about Email address again"); rendered as a real `<button>`. **Behavior note (accepted):** activating a mute re-renders the findings list and, via the dialog's `setBody`, focus moves to the first actionable control in the dialog — focus never escapes the dialog or falls to `body`. If every remaining finding is removed, the dialog closes and focus is restored to the composer (the standard close path). Critical-secret rows intentionally have no mute button; this is a product-safety decision, not an accessibility gap.

### A2 — Custom-domain permission flow and status messages (popup)

The add-domain flow now shows inline outcomes (validation errors, "permission declined", success) in a `.domain-status` element with `role="status"` and `aria-live="polite"` — announced without stealing focus (WCAG 4.1.3). Error text states the problem and the correction in words (3.3.1, 3.3.3); the error style adds color (`--risk-critical-fg`, ≥ 4.5:1 on the popup surface) but meaning never relies on color alone. The domain input supports Enter-to-add in addition to the Add button.

### A3 — Muted warnings / unmute section (popup)

A new section lists muted categories with per-row "Unmute" buttons, each labelled with the category name (`aria-label="Unmute Email address warnings"`). Native buttons in the existing labelled-section pattern; no new issues.

### A4 — New popup text styles

`.section__hint`, `.domain-status`, and `.stat__split` are styled from design tokens: hint and split use `--color-muted` (#6B7280, 4.86:1 on the paper background — passes AA for their ≥ 11px text), status body uses `--color-ink`, error state uses `--risk-critical-fg` (4.63:1+). No new contrast failures.

### Addendum verdict

No new findings at Level A or AA. F7 (advisory `aria-describedby` on the disabled send button) remains the only open item, unchanged from v1.0.0. A manual NVDA/VoiceOver pass over the mute → re-render → focus path is recommended as part of the pre-submission screen-reader check.
