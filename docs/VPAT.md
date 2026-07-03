# Accessibility Conformance Report (ACR)

## AI Safety Guard — Chrome Extension

Based on VPAT Version 2.5 (Revised Section 508 edition).

This is a self-assessment prepared by the product author, intended to accompany the extension when it is offered to a federal agency. It reflects the source code as of version 1.1.0 (July 2026), including the v1.1 additions audited in the addendum to `ACCESSIBILITY-AUDIT.md` (per-category mute controls, the custom-domain permission flow with inline status messages, and the muted-warnings/unmute section). The remediation described in `ACCESSIBILITY-AUDIT.md` (findings F1 through F6) has been implemented and is covered by automated tests, and this report reflects that remediated build. It has not yet been validated by an independent third party; an independent evaluation can be arranged on request.

---

### Product information

| Field | Value |
|-------|-------|
| Name | AI Safety Guard |
| Version | 1.1.0 |
| Product description | A free, on-device Chrome extension (Manifest V3) that warns the user before sensitive information is sent to an AI chat tool. All scanning is local; no user content leaves the browser. |
| Date | July 2026 |
| Contact | Hemant Naik, hemant.naik@gmail.com |
| Evaluation method | Manual source-code review of the popup, onboarding, and warning/redact UI, plus programmatic WCAG color-contrast calculation. Self-assessment. |

### Applicable standards

| Standard | Included |
|----------|----------|
| WCAG 2.1 Level A | Yes |
| WCAG 2.1 Level AA | Yes |
| Revised Section 508 (36 CFR Part 1194, Appendices A, C, D) | Yes |

### Conformance terms

- **Supports**: The functionality meets the criterion without known defects.
- **Partially Supports**: Some functionality meets the criterion.
- **Does Not Support**: The majority of functionality does not meet the criterion.
- **Not Applicable**: The criterion is not relevant to the product.

---

## Table 1 — WCAG 2.1 Level A

| Criteria | Conformance | Remarks |
|----------|-------------|---------|
| 1.1.1 Non-text Content | Supports | Icon-only controls (close, remove-domain) have `aria-label`s; the per-finding mute and per-category unmute buttons carry `aria-label`s naming the category; the brand mark is decorative and adjacent to a text wordmark. |
| 1.2.1–1.2.3 (audio/video) | Not Applicable | No audio or video content. |
| 1.3.1 Info and Relationships | Supports | Controls and labels are programmatically associated; the popup and onboarding sensitivity controls are wrapped in a labelled `role="group"`, and modal findings use `role="list"`/`role="listitem"`. |
| 1.3.2 Meaningful Sequence | Supports | DOM order matches visual order. |
| 1.3.3 Sensory Characteristics | Supports | Instructions do not rely on shape, size, or position alone. |
| 1.4.1 Use of Color | Supports | Every risk level carries a text label in addition to color. |
| 1.4.2 Audio Control | Not Applicable | No audio. |
| 2.1.1 Keyboard | Supports | All controls are keyboard operable, including the onboarding sensitivity options (native `<button>` elements), the per-finding mute buttons inside the warning dialog's focus trap, and the custom-domain input (Enter activates Add). Regression tests assert this. |
| 2.1.2 No Keyboard Trap | Supports | The warning modal uses an intentional, escapable focus trap (Escape and the close button both dismiss it); focus is restored on close. |
| 2.1.4 Character Key Shortcuts | Not Applicable | No single-character key shortcuts are defined. |
| 2.2.1 Timing Adjustable | Not Applicable | No time limits. |
| 2.2.2 Pause, Stop, Hide | Not Applicable | No moving, blinking, or auto-updating content. |
| 2.3.1 Three Flashes | Supports | No flashing content. |
| 2.4.1 Bypass Blocks | Not Applicable | Single-view popup and onboarding; no repeated blocks of navigation. |
| 2.4.2 Page Titled | Supports | The popup and onboarding documents have descriptive `<title>`s. |
| 2.4.3 Focus Order | Supports | Order within each view is logical, and advancing an onboarding step moves focus to the new step heading. |
| 2.4.4 Link Purpose (In Context) | Supports | Actionable text is self-describing. |
| 2.5.1 Pointer Gestures | Supports | All actions are single-point taps; no path or multipoint gestures. |
| 2.5.2 Pointer Cancellation | Supports | Actions fire on click (up event), cancellable by moving off-target. |
| 2.5.3 Label in Name | Supports | Visible labels match accessible names. |
| 2.5.4 Motion Actuation | Not Applicable | No motion-actuated functionality. |
| 3.1.1 Language of Page | Supports | `lang="en"` is set on both pages. |
| 3.2.1 On Focus | Supports | Focus does not trigger a change of context. |
| 3.2.2 On Input | Supports | Changing a toggle updates a setting without an unexpected context change. |
| 3.3.1 Error Identification | Supports | Custom-domain validation errors (invalid domain, http-only, declined permission) are identified in text next to the field and announced through a `role="status"` live region. |
| 3.3.2 Labels or Instructions | Supports | Inputs have visible labels or `aria-label`s and placeholder guidance. |
| 4.1.1 Parsing | Supports | Markup is generated programmatically with unique ids and valid nesting. |
| 4.1.2 Name, Role, Value | Supports | Native controls expose correct name/role/value; the onboarding options expose their selected state via `aria-pressed`; and the warning dialog is named by its visible heading via `aria-labelledby`. |

## Table 2 — WCAG 2.1 Level AA

| Criteria | Conformance | Remarks |
|----------|-------------|---------|
| 1.2.4–1.2.5 (live captions, audio description) | Not Applicable | No media. |
| 1.3.4 Orientation | Supports | No orientation lock; content reflows. |
| 1.3.5 Identify Input Purpose | Supports | The only free-text field (custom AI domain) is not one of the defined input-purpose types; it is labelled. |
| 1.4.3 Contrast (Minimum) | Supports | All text meets or exceeds 4.5:1, including the four risk pills, whose foreground tokens were darkened to 4.63:1 to 4.68:1 against their backgrounds. |
| 1.4.4 Resize Text | Supports | Layout uses a fixed type scale that scales with browser zoom without loss of content. |
| 1.4.5 Images of Text | Supports | No images of text; all text is real text. |
| 1.4.10 Reflow | Supports | Content reflows within the popup and card widths without horizontal scrolling. |
| 1.4.11 Non-text Contrast | Supports | Controls and their boundaries meet 3:1; the off-state toggle now carries a `--color-muted` border (about 4.8:1 on white) and all custom controls have explicit focus indicators. |
| 1.4.12 Text Spacing | Supports | No content is clipped when text spacing is increased; no fixed-height text containers. |
| 1.4.13 Content on Hover or Focus | Not Applicable | No hover or focus tooltips/popups. |
| 2.4.5 Multiple Ways | Not Applicable | Single-purpose UI, not a set of web pages. |
| 2.4.6 Headings and Labels | Supports | Headings and labels are descriptive; the warning dialog is named by its heading and control groups carry descriptive group labels. |
| 2.4.7 Focus Visible | Supports | Explicit `:focus-visible` outlines are defined for all custom controls: buttons, the segmented control, toggle switches, onboarding option cards, inputs, and the dialog close button. |
| 3.1.2 Language of Parts | Supports | Content is single-language (English). |
| 3.2.3 Consistent Navigation | Not Applicable | Single-view surfaces. |
| 3.2.4 Consistent Identification | Supports | Repeated components (toggles, buttons) are identified consistently. |
| 3.3.3 Error Suggestion | Supports | Validation messages state how to correct the input (e.g. "Enter a full domain, like chat.example.com"; "Only https:// sites are supported"). |
| 3.3.4 Error Prevention (Legal, Financial, Data) | Not Applicable | No legal, financial, or data-submission transactions. |
| 4.1.3 Status Messages | Supports | The custom-domain status line is a `role="status"` `aria-live="polite"` region, so add/decline/error outcomes are announced without moving focus. Other context changes are conveyed through focus management: onboarding step changes move focus to the new step heading, and a successful redaction enables and moves focus to the send action. |

---

## Revised Section 508 Report

### Chapter 3 — Functional Performance Criteria (302)

| Criteria | Conformance | Remarks |
|----------|-------------|---------|
| 302.1 Without Vision | Supports | All surfaces are keyboard and screen-reader operable; the dialog is named by its heading and option states are exposed via ARIA. |
| 302.2 With Limited Vision | Supports | All text meets AA contrast, control boundaries and focus indicators meet 3:1, and content scales with zoom. |
| 302.3 Without Perception of Color | Supports | Risk is always labelled in text. |
| 302.4 Without Hearing | Not Applicable | No audio output. |
| 302.5 With Limited Hearing | Not Applicable | No audio output. |
| 302.6 Without Speech | Not Applicable | No speech input. |
| 302.7 With Limited Manipulation | Supports | All controls are operable by keyboard alone, including the onboarding sensitivity options. |
| 302.8 With Limited Reach and Strength | Supports | No reach or strength demands. |
| 302.9 With Limited Language, Cognitive, and Learning Abilities | Supports | Plain-language copy, consistent layout, no time limits. |

### Chapter 4 — Hardware

Not Applicable. The product is software only.

### Chapter 5 — Software (501–504)

| Criteria | Conformance | Remarks |
|----------|-------------|---------|
| 501.1 Scope / 504 Authoring Tool | Not Applicable | Not an authoring tool. |
| 502 Interoperability with Assistive Technology | Supports | Built with standard DOM and ARIA; native controls and labelled groups expose name, role, value, and state to assistive technology. |
| 503 Applications | Supports | User focus and selection are respected; focus is managed across onboarding steps and into and out of the warning dialog. |
| 504 Authoring Tools | Not Applicable | Not an authoring tool. |

### Chapter 6 — Support Documentation and Services (601–603)

| Criteria | Conformance | Remarks |
|----------|-------------|---------|
| 602 Support Documentation | Supports | README, PRIVACY.md, and this report are provided as accessible Markdown/HTML text. |
| 603 Support Services | Supports | Support is offered by email; accessibility questions can be directed to the contact above. |

---

## Legal disclaimer

This document is provided for information purposes only and represents the author's good-faith self-assessment of the current product. It is not a warranty. The product is actively maintained; the items identified in the accompanying audit have been remediated and are guarded by automated tests, and an independent evaluation can be arranged on request.
