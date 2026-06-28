<p align="center">
  <img src="assets/icons/icon128.png" width="88" height="88" alt="AI Safety Guard logo" />
</p>

<h1 align="center">AI Safety Guard</h1>

<p align="center"><b>Think before you send.</b><br />A free Chrome extension that warns you before private information reaches an AI tool. All scanning happens on your device.</p>

## What this does

<img src="assets/icons/icon48.png" width="20" height="20" align="left" alt="" />

AI Safety Guard watches the message box on ChatGPT, Claude, Gemini, Perplexity, and Microsoft Copilot. As you type, it scans your text locally for sensitive information: emails, phone numbers, credit cards, SSNs, API keys, passwords, and confidential business, legal, financial, or health language.

If you try to send something risky, it pauses and shows a clear warning listing what it found, always masked, never the raw secret. You can redact the values, send anyway, or keep editing. Your text never leaves your device.

## Features

- Local scanning. Prompts are analyzed on your device, never stored or uploaded.
- Pre-send warning that lists what was found, with masked values only.
- Live risk badge near the input box that updates as you type.
- One-click redaction that swaps sensitive values for labels like [EMAIL] and [API_KEY].
- Attachment scanning. Attach a PDF or Word file and it scans the file's text on your device, including hidden comments and metadata.
- Three sensitivity modes: Basic, Balanced, and Strict.
- Per-site control and custom domains from a small popup.
- No accounts, no ads, no prompt logging, and no network calls at all.

## Who is this for

Everyday AI users, employees using AI at work, students and researchers, freelancers, developers who do not want to paste keys or source into a chat box, and security-conscious teams.

## Getting started

1. Run `npm install` then `npm run build`.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and select the `dist` folder.
4. The setup screen opens on first install. Choose your sensitivity and the sites to watch.

## Common issues

**Fonts look wrong on a site.** Some sites have a strict Content Security Policy. The extension loads its own fonts to work around this; if you see a system font, reload the tab once.

**Badge or warning does not appear.** AI sites change their layout often. Reopen the popup and confirm the site toggle is on. If it still does not appear, check the console for a message starting with `[AI Safety Guard]`.

**Nothing is saved.** Settings live in browser local storage. Locked-down or guest profiles that block extension storage will not persist preferences.

## Privacy

Scanning is local and there are no network calls. The extension stores only your settings and a single "risky sends caught" counter, never your text or files. Full policy: [PRIVACY.md](PRIVACY.md).

## Author

Hemant Naik [LinkedIn](https://www.linkedin.com/in/tanaji-naik/) · [hemant.naik@gmail.com](mailto:hemant.naik@gmail.com)

Built March 2026
