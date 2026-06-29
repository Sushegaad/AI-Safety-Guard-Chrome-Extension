# AI Safety Guard — Privacy Policy

**Effective date:** June 27, 2026
**Applies to:** AI Safety Guard Chrome Extension (v1.0.0)

AI Safety Guard is built on a simple promise: **your prompts are scanned on your own device, and nothing you type is collected, transmitted, or stored by us.** This policy explains exactly what the extension does and does not do with your information.

## Summary (the short version)

- Scanning for sensitive information happens **entirely in your browser**. Your prompt text never leaves your device.
- The extension makes **no network calls at all**. It does **not** collect, log, sell, or transmit your prompts, the sites you visit, or any personal information.
- The extension stores only **your settings and a single counter** ("risky sends caught") in your browser's local storage. This never includes prompt text.

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
- Whether analytics are enabled
- Whether onboarding is complete
- `riskySubmissionsCaught` — a running count of how many times a warning was shown

This data lives only on your device. It is never uploaded to us. **Prompt text is never part of this stored data.** Uninstalling the extension removes all of it.

## Analytics

Any usage analytics are **aggregate and non-identifying**, can be turned off in settings, and **never include any portion of your prompt text**. Events are limited to counts and categories (for example, that a warning was shown at a given risk level). The current release ships without any third-party analytics or telemetry SDKs.

## Permissions and why we need them

- **storage** — to save your settings and the counter described above, on your device.
- **offscreen** — to run the bundled PDF text extractor locally so attached PDFs can be scanned in your browser. It makes no network requests.
- **Host permissions** (specific AI site URLs only) — the extension requests access **only** to the supported AI tools (and custom domains you add). It does **not** request access to all sites.

We do not request access to your browsing history, bookmarks, downloads, or any site beyond the AI tools listed above.

## Data sharing and sale

We do not sell, rent, or share your data. We do not serve ads. Because we do not collect your prompts or personal information in the first place, there is nothing for us to share.

## Children

AI Safety Guard is a general-purpose productivity tool and is not directed to children under 13.

## Changes to this policy

If this policy changes, we will update the effective date above and publish the revised policy with the extension listing. Material changes affecting how data is handled will be highlighted in the release notes.

## Contact

Questions about this policy or your privacy can be directed to the project maintainer via the Chrome Web Store listing's support channel.
