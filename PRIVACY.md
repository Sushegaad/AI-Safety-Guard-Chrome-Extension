# AI Safety Guard — Privacy Policy

**Effective date:** June 27, 2026
**Applies to:** AI Safety Guard Chrome Extension (v1.0.0)

AI Safety Guard is built on a simple promise: **your prompts are scanned on your own device, and nothing you type is collected, transmitted, or stored by us.** This policy explains exactly what the extension does and does not do with your information.

## Summary (the short version)

- Scanning for sensitive information happens **entirely in your browser**. Your prompt text never leaves your device.
- The extension makes **no network calls at all**. It does **not** collect, log, sell, or transmit your prompts, the sites you visit, or any personal information.
- The extension stores only **your settings and a few local counters** ("risky sends caught" and what you did after each warning — redacted, sent anyway, or kept editing) in your browser's local storage. This never includes prompt text.

## What the extension does

When you type into a supported AI tool (ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, or a custom domain you add), AI Safety Guard scans the text in your input box for sensitive information — things like email addresses, phone numbers, credit-card and Social Security numbers, API keys, passwords, and confidential business, legal, financial, or health language.

This scanning is performed entirely by code running inside your browser. The text is analyzed in memory and discarded; it is not written to disk, sent to any server, or shared with us or anyone else.

When you attach a PDF or Word (.docx) file, the extension reads and extracts the file's text **inside your browser** to scan it for personal data (including hidden comments and document metadata). The file and its contents are never uploaded by the extension to any server. PDF parsing uses a bundled library that runs locally. You can turn attachment scanning off in settings.

## Information we store

The extension uses your browser's local storage (`chrome.storage.local`) to remember your preferences and one usage counter. Specifically:

- Whether the extension is enabled
- Your chosen sensitivity level (Basic / Balanced / Strict)
- Which sites you want watched, and any custom domains you add
- Detection categories you have muted
- Whether onboarding is complete
- `riskySubmissionsCaught` — a running count of how many times a warning was shown
- `outcomes` — running counts of what you chose after a warning (redacted / sent anyway / kept editing), so the popup can show you your own stats. These are plain numbers with no prompt content attached
- **Catch history (optional, off by default)** — if you enable "Keep a local history of catches" in the popup, the last 20 warnings are stored with a timestamp, the category, and the **masked** value only (e.g. `sk-live-••••`). The raw secret is never stored. The list lives only on this device, can be cleared with one click, and is removed on uninstall

This data lives only on your device. It is never uploaded to us. **Prompt text is never part of this stored data.** Uninstalling the extension removes all of it.

## Analytics and telemetry

The extension collects **no analytics** and contains **no telemetry**. It makes no network calls, so nothing about you or your usage is sent anywhere. The only usage data is the local `riskySubmissionsCaught` and `outcomes` counts described above — a personal feedback loop shown in the popup that stays on your device and is never reported to us or anyone else.

## Permissions and why we need them

- **storage** — to save your settings and the counters described above, on your device.
- **offscreen** — to run the bundled PDF text extractor locally so attached PDFs can be scanned in your browser. It makes no network requests.
- **scripting** — to activate the scanner on custom domains you explicitly add. It is used for nothing else.

**Shield Mode (optional, off by default):** when you turn on Shield Mode for a site, you type inside a small box that belongs to the extension, not the website. Because it runs on the extension's own origin, the website's scripts cannot read what you type there — the raw text stays on your device until you approve it. Only the text you approve (optionally with sensitive values redacted) is placed into the site's real message box. Shield Mode makes no network calls and stores nothing; the only thing saved is your per-site on/off choice.
- **Host permissions** (specific AI site URLs only) — the extension has access **only** to the supported AI tools. It does **not** have access to all sites.
- **Optional host permissions** — when you add a custom domain, Chrome asks you to grant access **for that one site**. Nothing is granted by default; you approve each site individually, and removing the domain (or revoking it from `chrome://extensions`) withdraws that access.

We do not request access to your browsing history, bookmarks, downloads, or any site beyond the AI tools listed above and the individual sites you choose to add.

## Data sharing and sale

We do not sell, rent, or share your data. We do not serve ads. Because we do not collect your prompts or personal information in the first place, there is nothing for us to share.

## Children

AI Safety Guard is a general-purpose productivity tool and is not directed to children under 13.

## Changes to this policy

If this policy changes, we will update the effective date above and publish the revised policy with the extension listing. Material changes affecting how data is handled will be highlighted in the release notes.

## Contact

Questions about this policy or your privacy can be directed to the project maintainer via the Chrome Web Store listing's support channel.
