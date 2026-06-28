# AI Safety Guard — Privacy Policy

**Effective date:** June 27, 2026
**Applies to:** AI Safety Guard Chrome Extension (v1.0.0)

AI Safety Guard is built on a simple promise: **your prompts are scanned on your own device, and nothing you type is collected, transmitted, or stored by us.** This policy explains exactly what the extension does and does not do with your information.

## Summary (the short version)

- Scanning for sensitive information happens **locally in your browser**. Your prompt text never leaves your device during a scan.
- We do **not** collect, log, sell, or transmit your prompts, the sites you visit, or any personal information.
- The extension stores only **your settings and a single counter** ("risky sends caught") in your browser's local storage. This never includes prompt text.
- The **"Rewrite it safely"** feature generates a safer version of your prompt **on your device by default**, with no network call. Text is sent off device only if you deliberately configure a custom cloud rewrite endpoint, and then only after you give consent.

## What the extension does

When you type into a supported AI tool (ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, or a custom domain you add), AI Safety Guard scans the text in your input box for sensitive information — things like email addresses, phone numbers, credit-card and Social Security numbers, API keys, passwords, and confidential business, legal, financial, or health language.

This scanning is performed entirely by code running inside your browser. The text is analyzed in memory and discarded; it is not written to disk, sent to any server, or shared with us or anyone else.

## Information we store

The extension uses your browser's local storage (`chrome.storage.local`) to remember your preferences and one usage counter. Specifically:

- Whether the extension is enabled
- Your chosen sensitivity level (Basic / Balanced / Strict)
- Which sites you want watched, and any custom domains you add
- Detection categories you have muted
- Whether you have consented to cloud rewrite, and your configured rewrite endpoint
- Whether analytics are enabled
- Whether onboarding is complete
- `riskySubmissionsCaught` — a running count of how many times a warning was shown

This data lives only on your device. It is never uploaded to us. **Prompt text is never part of this stored data.** Uninstalling the extension removes all of it.

## "Rewrite it safely" and when text could leave your device

The "Rewrite it safely" feature (Screen B2) generates a safer, generalized version of your prompt. By default this happens **entirely on your device**: the extension replaces detected sensitive values with generic descriptions and sends nothing to any server.

Sending text to a cloud service is **opt-in** and governed by strict rules:

- Cloud rewrite is **off by default.** With no custom endpoint configured, the rewrite is always local.
- If you (or your organization) configure a custom rewrite endpoint in settings, the first cloud use shows a clear consent prompt that you must explicitly accept. We do not ask again after you decide.
- A cloud call runs **only** when you click "Rewrite it safely" with a custom endpoint configured and consent given, never automatically and never in the background.
- When a cloud call is made, it sends only: the prompt text you chose to rewrite, the categories of sensitive data detected, and a fixed instruction to remove or generalize sensitive details.
- If a configured cloud endpoint cannot be reached, the extension falls back to the on-device rewrite and your text is not sent.

## Analytics

Any usage analytics are **aggregate and non-identifying**, can be turned off in settings, and **never include any portion of your prompt text**. Events are limited to counts and categories (for example, that a warning was shown at a given risk level). The current release ships without any third-party analytics or telemetry SDKs.

## Permissions and why we need them

- **storage** — to save your settings and the counter described above, on your device.
- **activeTab / scripting** — to run the local scanner and show the badge and warning UI on the AI sites you choose.
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
