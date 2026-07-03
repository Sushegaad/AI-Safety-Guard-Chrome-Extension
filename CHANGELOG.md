# Changelog

All notable changes to AI Safety Guard. Selector bumps get their own lines so
store reviewers can see exactly what changed and why.

## v1.1.0 — July 2026

### Detection
- Fixed systematic misses: hex-only API keys (charset-relative entropy), PEM
  private keys, JWTs, credential-bearing webhook URLs, dash-less/spaced SSNs
  (keyword-anchored), bare IBANs (mod-97 validated), dot-separated card numbers.
- Input normalization: zero-width characters stripped and line-wrapped secrets
  joined before scanning; match offsets still map to the original text.

### Sensitivity retune
- Balanced (default) now interrupts on high + critical only; medium findings
  (emails, phones, code) show the amber badge without a modal.
- Source-code detection never interrupts — badge only. Secrets inside code
  still interrupt via their own categories.
- "Order/ticket/invoice #" style identifiers require a corroborating personal
  identifier before flagging.
- Per-category "Don't warn about this" mute (never for critical secrets), with
  unmute controls in the popup.
- Popup shows outcome counters (redacted / sent anyway) — local only.

### Custom domains
- Implemented properly: per-site optional host permission requested on add,
  dynamic content-script registration, service-worker reconciliation heals
  revoked grants. Labelled experimental.
- New `scripting` permission (no install warning) and
  `optional_host_permissions: ["https://*/*"]` (granted per-origin, on demand).

### Drift resilience
- Degraded mode: if a supported site's selectors stop matching, the content
  script falls back to generic composer heuristics after 4 s instead of
  silently doing nothing.
- `selectorVersion` added per site in `src/shared/sites.js`.
- Two-tier Playwright e2e: hermetic fixtures on every PR, weekly live-site
  drift probe that files a GitHub issue on drift.

### Documentation & compliance
- Federal security overview rewritten for the new permission model (scripting +
  per-origin optional grants, enterprise policy note).
- VPAT re-issued for 1.1.0: 3.3.1 and 3.3.3 move from Not Applicable to
  Supports (inline, live-region-announced domain validation errors).
- Accessibility audit addendum covering the v1.1 surfaces (mute buttons,
  domain status messages, unmute section). No new A/AA findings; F7 advisory
  remains open.
- SBOM regenerated as 1.1.0; PRIVACY.md and site copy updated (counters,
  per-site permissions).

### Selector versions
- chatgpt 1 · claude 1 · gemini 1 · perplexity 1 · copilot 1 (baseline)

## v1.0.0 — March 2026

- Initial release.
