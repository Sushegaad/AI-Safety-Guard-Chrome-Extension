/* ============================================================================
 * AI Safety Guard — Detection Engine (detector.js)
 * ----------------------------------------------------------------------------
 * The product's core. Runs ENTIRELY on-device. No text leaves the browser
 * during a scan. `detect()` is a PURE, SYNCHRONOUS function:
 *
 *     detect(text) -> {
 *       riskLevel: "safe" | "medium" | "high" | "critical",
 *       categories: string[],          // e.g. ["api_key","account_number","email"]
 *       matches: Match[],              // { type, category, risk, rawValue,
 *                                      //   maskedValue, start, end, showInModal }
 *       summary: string,               // "API key, account number, email address"
 *       scanMs: number                 // scan duration (badge: "scanned locally · 18ms")
 *     }
 *
 * Masking: every match carries a maskedValue. The raw secret must NEVER reach
 * the UI — screens render maskedValue only.
 *
 * showInModal: identifier/secret findings are true; a bare customer NAME is
 * false (the design's A2 modal shows the account + email, not the name), but
 * the name match is still produced so B1 redaction can replace it with [NAME].
 *
 * Match offsets (start/end) always refer to the ORIGINAL input string, even
 * though scanning runs on a normalized copy (zero-width chars stripped).
 * ========================================================================== */

import RULES from '../shared/rules.json' with { type: 'json' };
import { RISK, RISK_ORDER, highestRisk } from '../shared/constants.js';

const now =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();

/* --- Category metadata -----------------------------------------------------
 * type        → human label shown in the A2 modal row
 * summary     → lowercase form used in the badge/summary line
 * redactLabel → the [LABEL] chip used by B1 redaction
 * risk        → severity id from constants.RISK
 * ------------------------------------------------------------------------- */
export const CATEGORY = {
  api_key:        { type: 'API key',          summary: 'API key',           redactLabel: '[API_KEY]', risk: 'critical' },
  password:       { type: 'Password',         summary: 'password',          redactLabel: '[SECRET]',  risk: 'critical' },
  connection_string:{ type: 'Database URL',   summary: 'database URL',      redactLabel: '[DB_URL]',  risk: 'critical' },
  private_key:    { type: 'Private key (PEM)', summary: 'private key',      redactLabel: '[PRIVATE_KEY]', risk: 'critical' },
  iban:           { type: 'IBAN',             summary: 'IBAN',              redactLabel: '[IBAN]',    risk: 'critical' },
  credit_card:    { type: 'Credit card',      summary: 'credit card',       redactLabel: '[CARD]',    risk: 'critical' },
  ssn:            { type: 'SSN',              summary: 'SSN',               redactLabel: '[SSN]',     risk: 'critical' },
  account_number: { type: 'Account number',   summary: 'account number',    redactLabel: '[ACCOUNT]', risk: 'high' },
  health:         { type: 'Health info',      summary: 'health information', redactLabel: '[HEALTH]',  risk: 'high' },
  financial:      { type: 'Financial data',   summary: 'financial data',    redactLabel: '[FINANCIAL]', risk: 'high' },
  legal:          { type: 'Legal language',   summary: 'legal language',    redactLabel: '[LEGAL]',   risk: 'high' },
  customer_data:  { type: 'Customer name',    summary: 'customer data',     redactLabel: '[NAME]',    risk: 'high' },
  internal_url:   { type: 'Internal URL',     summary: 'internal URL',      redactLabel: '[URL]',     risk: 'high' },
  email:          { type: 'Email address',    summary: 'email address',     redactLabel: '[EMAIL]',   risk: 'medium' },
  phone:          { type: 'Phone number',     summary: 'phone number',      redactLabel: '[PHONE]',   risk: 'medium' },
  address:        { type: 'Physical address', summary: 'physical address',  redactLabel: '[ADDRESS]', risk: 'medium' },
  // interrupt:false — code alone is context, not a leak (secrets INSIDE code are
  // caught by their own categories). Badge-only in every mode.
  source_code:    { type: 'Source code',      summary: 'source code',       redactLabel: '[CODE]',    risk: 'medium', interrupt: false },
  gov_id:          { type: 'Government ID',        summary: 'government ID',         redactLabel: '[GOV_ID]',    risk: 'critical' },
  education:       { type: 'Education record',     summary: 'education record',      redactLabel: '[EDU]',       risk: 'high' },
  workplace:       { type: 'Workplace/HR data',    summary: 'workplace data',        redactLabel: '[HR]',        risk: 'high' },
  special_category:{ type: 'Special-category data', summary: 'special-category data', redactLabel: '[SENSITIVE]', risk: 'high' },
  regulated:       { type: 'Regulated-data signal', summary: 'regulated-data signal', redactLabel: '[REGULATED]', risk: 'high' },
  restriction:     { type: 'Restriction notice',   summary: 'restriction notice',    redactLabel: '[RESTRICTED]', risk: 'high' },
  company_secret:  { type: 'Company secret',       summary: 'company secret',        redactLabel: '[INTERNAL]',  risk: 'high' },
  children:        { type: "Children's data",      summary: "children's data",       redactLabel: '[MINOR]',     risk: 'high' },
  location:        { type: 'Location/tracking',    summary: 'location data',         redactLabel: '[LOCATION]',  risk: 'high' },
  file_path:       { type: 'File path',            summary: 'file path',             redactLabel: '[PATH]',      risk: 'medium' },
};

/* ============================================================================
 * Helpers — entropy, Luhn, masking
 * ========================================================================== */

/** Shannon entropy (bits/char) of a string. */
export function shannonEntropy(str) {
  if (!str) return 0;
  const freq = Object.create(null);
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  const n = str.length;
  for (const k in freq) {
    const p = freq[k] / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Luhn checksum validation for credit-card candidates (digits only). */
export function luhnValid(digits) {
  if (!/^\d{13,16}$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/* --- Input normalization ----------------------------------------------------
 * Zero-width characters (U+200B/C/D, U+2060, U+FEFF) routinely survive
 * copy/paste from rich-text sources and split secrets invisibly. We scan a
 * stripped copy and map match offsets back to the ORIGINAL string so
 * redaction spans stay correct.
 * -------------------------------------------------------------------------- */
const ZERO_WIDTH = /\u200B|\u200C|\u200D|\u2060|\uFEFF/;

export function stripZeroWidth(text) {
  if (!ZERO_WIDTH.test(text)) return { text, toOrig: null };
  let norm = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ZERO_WIDTH.test(ch)) continue;
    map.push(i);
    norm += ch;
  }
  return {
    text: norm,
    toOrig: (start, end) => ({ start: map[start], end: map[end - 1] + 1 }),
  };
}

/* Shadow copy with intra-token newlines removed (secret pasted with a line
 * wrap). Returns the joined text plus an index map back to the input. */
function joinLines(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' && i > 0 && i + 1 < text.length && /\S/.test(text[i - 1]) && /\S/.test(text[i + 1])) {
      continue;
    }
    map.push(i);
    out += ch;
  }
  return { text: out, map };
}

/* --- IBAN validation (mod-97, ISO 13616) — same spirit as luhnValid -------- */
export const IBAN_LENGTHS = {
  AD: 24, AE: 23, AT: 20, BE: 16, BG: 22, BR: 29, CH: 21, CY: 28, CZ: 24,
  DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21,
  HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SA: 24, SE: 24,
  SI: 19, SK: 24, TR: 26,
};

export function ibanValid(compact) {
  const m = /^([A-Z]{2})(\d{2})([A-Z0-9]{11,30})$/.exec(compact);
  if (!m) return false;
  const expected = IBAN_LENGTHS[m[1]];
  if (!expected || compact.length !== expected) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

const DOTS = '••••'; // ••••
const ELLIPSIS = '…'; // …

export const mask = {
  api_key(raw) {
    // Show the recognizable prefix, then ••••  (e.g. sk-live-9fK2… → "sk-live-••••")
    const ordered = [...RULES.apiKeyPrefixes].sort((a, b) => b.length - a.length);
    for (const p of ordered) {
      if (p.endsWith(' ') || p.endsWith('=')) continue; // Bearer / token= handled at capture
      if (raw.startsWith(p)) return p + '••••';
    }
    return raw.slice(0, Math.min(8, raw.length)) + DOTS;
  },
  password() {
    return '••••••••';
  },
  connection_string(raw) {
    // postgres://user:pass@host  ->  postgres://user:••••@host (hide only the password)
    return String(raw).replace(/(:\/\/[^\s:/@]+:)[^\s:/@]+(@)/, '$1' + DOTS + '$2');
  },
  private_key() {
    // Never render any part of the key material — the header is enough.
    return '-----BEGIN ' + DOTS + '-----';
  },
  iban(raw) {
    const c = String(raw).replace(/\s+/g, '');
    return c.slice(0, 4) + DOTS + c.slice(-4); // country + check digits … last 4
  },
  credit_card(raw) {
    const d = raw.replace(/\D/g, '');
    return '••••' + d.slice(-4);
  },
  ssn(raw) {
    const d = raw.replace(/\D/g, '');
    return '•••-••-' + d.slice(-4);
  },
  account_number(raw) {
    const d = raw.replace(/\D/g, '');
    return '#' + d.slice(0, 2) + '•••';
  },
  email(raw) {
    const at = raw.indexOf('@');
    const local = at > -1 ? raw.slice(0, at) : raw;
    return local + '@' + ELLIPSIS;
  },
  phone(raw) {
    const d = raw.replace(/\D/g, '');
    return '•••-•••-' + d.slice(-4);
  },
  address(raw) {
    // Truncate to the street line only (drop city/state/zip after first comma).
    const street = raw.split(',')[0].trim();
    return street + ELLIPSIS;
  },
  customer_data(raw) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
    return parts[0];
  },
  internal_url(raw) {
    try {
      const u = raw.includes('://') ? new URL(raw) : new URL('http://' + raw);
      return u.host + (u.pathname && u.pathname !== '/' ? '/' + ELLIPSIS : '');
    } catch {
      return raw.slice(0, 16) + ELLIPSIS;
    }
  },
  gov_id(raw) {
    const a = String(raw).replace(/[^A-Za-z0-9]/g, '');
    return DOTS + a.slice(-4);
  },
  file_path(raw) {
    const parts = String(raw).split(/[\\/]/);
    return ELLIPSIS + '\\' + parts[parts.length - 1];
  },
  keyword(raw) {
    const s = raw.trim();
    return s.length > 24 ? s.slice(0, 24) + ELLIPSIS : s;
  },
};

function maskFor(category, raw) {
  if (typeof mask[category] === 'function') return mask[category](raw);
  return mask.keyword(raw);
}

/* ============================================================================
 * Individual detectors. Each pushes { category, rawValue, start, end } objects.
 * Compiled once at module load (never per-call) for performance.
 * ========================================================================== */

const RE = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone:
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g,
  ssn: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  // Keyword-anchored SSN — catches dash-less and space-separated forms while the
  // anchor keeps phone/zip/order-number collisions out.
  ssnAnchored:
    /\b(?:ssn|social\s+security(?:\s+(?:number|no\.?|#))?|soc\s*sec)\b[\s:.#-]*(?:is|was|number|no\.?)?[\s:#-]*(\d{3})[\s-]?(\d{2})[\s-]?(\d{4})\b/gi,
  // Separators widened to space/hyphen/dot ("4111.1111.1111.1111"); Luhn gates FPs.
  ccCandidate: /\b(?:\d[ .-]?){13,16}\b/g,
  // PEM private-key material — the BEGIN header alone fires (pastes get truncated).
  pem: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----)?/g,
  // JWT: three base64url segments, first decoding to '{"' ("eyJ").
  jwt: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Credential-bearing webhook URLs (Slack, Discord, Microsoft Teams/Outlook).
  webhookUrl:
    /\bhttps:\/\/(?:hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+|discord(?:app)?\.com\/api\/webhooks\/[A-Za-z0-9/_-]+|[a-z0-9-]+\.webhook\.office\.com\/webhookb2\/[^\s"'<>]+|outlook\.office\.com\/webhook\/[^\s"'<>]+)/gi,
  // Bare IBAN candidate (optionally space-grouped); ibanValid() (mod-97 +
  // country length) is the real gate, mirroring the Luhn approach for cards.
  ibanCandidate: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,32}\b/g,
  account: /(?:\baccount\b|\bacct\b|\ba\/c\b)?\s*#\s?(\d{4,})\b/gi,
  accountWord: /\b(?:account|acct)\s*(?:number|no\.?|#)?\s*:?\s*(\d{4,})\b/gi,
  apiPrefixed:
    /\b(?:sk-(?:live|test|proj)?-?[A-Za-z0-9]{12,}|pk-(?:live|test)?-?[A-Za-z0-9]{12,}|gh[posur]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|shpat_[A-Za-z0-9]{20,})\b/g,
  bearer: /\b(?:Bearer\s+|token\s*=\s*["']?)([A-Za-z0-9._-]{16,})/g,
  passwordAssign:
    /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|passphrase)\b\s*["']?\s*[:=]\s*["']?([^\s"',;]{4,})/gi,
  // Env-var-style secret NAME (SCREAMING_SNAKE) before '=' — flags even when the
  // value is a placeholder. Compound secret words only, to avoid PRIMARY_KEY/MAX_TOKENS.
  envSecret:
    /\b([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|SECRET_KEY|CLIENT_SECRET|AUTH_TOKEN|ACCESS_TOKEN|API_TOKEN|CREDENTIALS?)[A-Z0-9_]*)\s*=/g,
  // Connection string with an embedded password: scheme://user:pass@host (postgres, mysql, mongodb+srv, redis, amqp, https…).
  connectionUri: /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s:/@]+:[^\s:/@]+@[^\s/?#]+/gi,
  address:
    /\b\d{1,6}\s+[A-Za-z0-9.\s]{1,40}?\b(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy)\b\.?(?:,?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)?/gi,
  currency: /(?:USD|EUR|GBP|\$|€|£)\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g,
  privateIp:
    /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.0\.0\.1|localhost)(?::\d{2,5})?\b/g,
  name: /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g,
  codeFence: /```[\s\S]*?```|`[^`\n]{8,}`/g,
  // Government IDs — keyword-anchored; the captured value must contain a digit.
  passport: /\bpassport\b\s*(?:no\.?|number|#|:)?\s*([A-Z0-9]{6,9})\b/gi,
  driversLicense: /\b(?:driver'?s?|driving|drivers)\s+licen[sc]e\b\s*(?:no\.?|number|#|:)?\s*([A-Z0-9]{5,18})\b/gi,
  nationalId: /\b(?:national\s+id(?:entity)?(?:\s+(?:card|number|no\.?))?|national\s+insurance(?:\s+number)?|nino|residence\s+permit|biometric\s+residence\s+permit|brp|sin|tax\s+id(?:entification)?(?:\s+number)?|tin)\b\s*(?:no\.?|number|#|:)?\s*([A-Z0-9][A-Z0-9-]{4,})\b/gi,
  // Labeled identifiers (alphanumeric, broader than the bare-# account rule).
  // Group 1 = label (classified strong/weak below), group 2 = the identifier.
  labeledId: /\b(account|acct|customer|member|student|patient|case|ticket|reference|ref|order|policy|claim|invoice|employee|badge)\b\s*(?:id|no\.?|number|#)?\s*[:#]?\s*#?\s*([A-Za-z]*\d[A-Za-z0-9-]{3,})\b/gi,
  gpsCoords: /[-+]?\d{1,2}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}/g,
  winPath: /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)+[^\\/:*?"<>|\r\n]+/g,
  uncPath: /\\\\[A-Za-z0-9._$-]+\\[^\s\\]+(?:\\[^\s\\]+)*/g,
  unixPath: /(?:\/(?:home|Users))\/[A-Za-z0-9._-]+\/\S+/g,
};

function pushAll(out, re, category, text, validate) {
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    if (validate && !validate(m)) continue;
    out.push({ category, rawValue: raw, start: m.index, end: m.index + raw.length });
  }
}

// Tokens for generic high-entropy secret detection.
/* Charset-relative thresholds. A flat >4.0 gate makes hex-only secrets
 * UNDETECTABLE: hex max entropy is log2(16) = 4.0 exactly. Azure, Mailchimp
 * and many vendor keys are pure hex, so hex gets its own threshold. */
const ENTROPY_THRESHOLDS = { hex: 3.4, base64ish: 4.0 };
const HEX_MIN_LENGTH = 28; // dodges 24-hex Mongo ObjectIds; 32-hex keys still caught
const HASH_CONTEXT = /\b(?:commit|sha-?\d*|hash|md5|checksum|digest|etag)\b[\s:=("'`-]*$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function detectGenericSecrets(out, text) {
  const tokenRe = /[A-Za-z0-9_\-+/=.]{20,}/g;
  for (const m of text.matchAll(tokenRe)) {
    const tok = m[0];
    if (tok.includes('@')) continue; // emails handled elsewhere
    if (UUID_RE.test(tok)) continue; // request/trace ids, not secrets
    const hasLetter = /[A-Za-z]/.test(tok);
    const hasDigit = /\d/.test(tok);
    if (!(hasLetter && hasDigit)) continue;
    const isHex = /^[0-9a-f]+$/i.test(tok);
    if (isHex) {
      if (tok.length < HEX_MIN_LENGTH) continue;
      // Hex blobs pasted as *hashes* (git SHAs, checksums) are public values —
      // skip when the preceding context says so.
      if (HASH_CONTEXT.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
      if (shannonEntropy(tok) <= ENTROPY_THRESHOLDS.hex) continue;
    } else {
      if (shannonEntropy(tok) <= ENTROPY_THRESHOLDS.base64ish) continue;
    }
    out.push({ category: 'api_key', rawValue: tok, start: m.index, end: m.index + tok.length });
  }
}

function detectKeywords(out, text, list, category, opts = {}) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const kw of list) {
    let from = 0;
    let idx;
    while ((idx = lower.indexOf(kw, from)) !== -1) {
      // Skip our own redaction labels: "[IBAN]" must not re-fire the "iban"
      // keyword on the post-redact rescan (it kept the send button disabled).
      const isRedactLabel = text[idx - 1] === '[' && text[idx + kw.length] === ']';
      // word-ish boundary check for short alpha keywords
      if (!isRedactLabel) hits.push({ kw, idx });
      from = idx + kw.length;
    }
  }
  if (hits.length === 0) return 0;
  if ((opts.minDistinct || 1) > new Set(hits.map((h) => h.kw)).size) return 0;
  // Emit a span for EVERY hit so B1 redaction removes all of them and the
  // post-redact rescan can actually come back safe (a single leftover keyword
  // used to keep "Looks good — send" permanently disabled). Only the first
  // hit is a modal row; the rest are hidden redaction-support spans.
  hits.sort((a, b) => a.idx - b.idx);
  hits.forEach((h, i) => {
    out.push({
      category,
      rawValue: text.slice(h.idx, h.idx + h.kw.length),
      start: h.idx,
      end: h.idx + h.kw.length,
      ...(i > 0 ? { showInModal: false } : {}),
    });
  });
  return hits.length;
}

// Children's data: explicit safeguarding/custody terms fire on their own;
// otherwise require a minor age co-occurring with a school/childcare cue.
function detectChildren(out, text) {
  // Keyword pass emits every occurrence (redaction completeness, see above).
  if (detectKeywords(out, text, RULES.childrenKeywords, 'children')) return;
  const ageM = text.match(/\bage[d]?\s*(1?\d)\b/i);
  const school = /\b(?:elementary|primary school|kindergarten|preschool|middle school|day\s?care|nursery|grade\s*[1-9]|year\s*[1-9]|pupil|schoolchild)\b/i.exec(text);
  if (ageM && parseInt(ageM[1], 10) <= 17 && school) {
    out.push({ category: 'children', rawValue: school[0], start: school.index, end: school.index + school[0].length });
  }
}

/* ============================================================================
 * Span de-overlap — when two matches overlap, keep the higher-risk one
 * (ties: keep the longer span). Prevents the same characters being counted
 * as, e.g., both a phone number and a credit card.
 * ========================================================================== */
/* Labeled-identifier classification (v1.1 FP retune). STRONG labels denote
 * inherently personal records and always fire. WEAK labels ("order #12345")
 * are everyday commerce noise — they only fire when another personal
 * identifier appears in the same text, or the ID itself looks like a real
 * account token (≥ 8 chars, mixed letters+digits). */
const WEAK_ID_LABELS = new Set(['order', 'ticket', 'invoice', 'reference', 'ref', 'case', 'badge']);
function weakIdQualifies(value) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function deOverlap(matches) {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const m of sorted) {
    const rank = RISK[CATEGORY[m.category].risk].rank;
    let drop = false;
    for (let i = kept.length - 1; i >= 0; i--) {
      const k = kept[i];
      if (m.start < k.end && k.start < m.end) {
        // overlap (different category only — same category dupes also collapse)
        const kRank = RISK[CATEGORY[k.category].risk].rank;
        if (rank > kRank || (rank === kRank && m.end - m.start > k.end - k.start && m.category === k.category)) {
          kept.splice(i, 1);
        } else {
          drop = true;
          break;
        }
      }
    }
    if (!drop) kept.push(m);
  }
  return kept;
}

/* ============================================================================
 * Core detect()
 * ========================================================================== */
export function detect(input) {
  const t0 = now();
  const raw = [];

  if (typeof input !== 'string' || input.length === 0) {
    return { riskLevel: 'safe', categories: [], matches: [], summary: '', scanMs: 0 };
  }

  // Normalize: scan a zero-width-stripped copy; offsets map back at the end.
  const { text, toOrig } = stripZeroWidth(input);

  // --- Critical: secrets & regulated identifiers ---
  pushAll(raw, RE.apiPrefixed, 'api_key', text);
  pushAll(raw, RE.pem, 'private_key', text);
  pushAll(raw, RE.jwt, 'api_key', text);
  pushAll(raw, RE.webhookUrl, 'api_key', text);
  // Second pass for secrets split by a line wrap: join intra-token newlines
  // and map any *new* API-key hits back to real offsets.
  if (text.includes('\n')) {
    const joined = joinLines(text);
    if (joined.text.length !== text.length) {
      for (const reKey of ['apiPrefixed', 'jwt']) {
        for (const m of joined.text.matchAll(RE[reKey])) {
          const start = joined.map[m.index];
          const end = joined.map[m.index + m[0].length - 1] + 1;
          raw.push({ category: 'api_key', rawValue: m[0], start, end });
        }
      }
    }
  }
  for (const m of text.matchAll(RE.bearer)) {
    raw.push({ category: 'api_key', rawValue: m[1], start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].indexOf(m[1]) + m[1].length });
  }
  detectGenericSecrets(raw, text);
  for (const m of text.matchAll(RE.passwordAssign)) {
    const val = m[2];
    const start = m.index + m[0].lastIndexOf(val);
    raw.push({ category: 'password', rawValue: val, start, end: start + val.length });
  }
  for (const m of text.matchAll(RE.envSecret)) {
    raw.push({ category: 'password', rawValue: m[1], start: m.index, end: m.index + m[1].length });
  }
  pushAll(raw, RE.connectionUri, 'connection_string', text);
  pushAll(
    raw, RE.ccCandidate, 'credit_card', text,
    (m) => !m[0].includes('..') && luhnValid(m[0].replace(/\D/g, ''))
  );
  pushAll(raw, RE.ssn, 'ssn', text);
  // Keyword-anchored SSN (dash-less / spaced), same area/group/serial rules.
  for (const m of text.matchAll(RE.ssnAnchored)) {
    const [area, group, serial] = [m[1], m[2], m[3]];
    if (area === '000' || area === '666' || area[0] === '9') continue;
    if (group === '00' || serial === '0000') continue;
    const digitsStart = m.index + m[0].search(/\d/);
    raw.push({ category: 'ssn', rawValue: text.slice(digitsStart, m.index + m[0].length), start: digitsStart, end: m.index + m[0].length });
  }
  // Bare IBANs — candidate shape gated by mod-97 checksum + country length.
  pushAll(raw, RE.ibanCandidate, 'iban', text, (m) => ibanValid(m[0].replace(/\s+/g, '')));
  // Government IDs (passport, driver's license, national/residence/tax IDs).
  for (const reKey of ['passport', 'driversLicense', 'nationalId']) {
    for (const m of text.matchAll(RE[reKey])) {
      const v = m[1];
      if (!v || !/\d/.test(v)) continue; // must contain a digit (drops "passport provided")
      const start = m.index + m[0].lastIndexOf(v);
      raw.push({ category: 'gov_id', rawValue: v, start, end: start + v.length });
    }
  }

  // --- High: account, health, financial, legal, internal urls ---
  // Weak-label candidates are held back until we know whether the text also
  // contains a real personal identifier (resolved below, after email/phone).
  const weakIds = [];
  for (const m of text.matchAll(RE.account)) {
    // rawValue must equal text.slice(start, end) — span starts at '#', so the
    // raw value is the '#'-prefixed number, not the whole "account #..." match.
    const start = m.index + m[0].indexOf('#');
    const end = m.index + m[0].length;
    const entry = { category: 'account_number', rawValue: text.slice(start, end), start, end };
    // A bare "#12345" with no account/acct label is weak (order numbers, GitHub
    // issues, receipts) — corroboration required.
    if (/\b(?:account|acct|a\/c)\b/i.test(m[0])) raw.push(entry);
    else weakIds.push(entry);
  }
  for (const m of text.matchAll(RE.accountWord)) {
    const val = m[1];
    const start = m.index + m[0].lastIndexOf(val);
    raw.push({ category: 'account_number', rawValue: val, start, end: start + val.length });
  }
  // Broader labeled identifiers (alphanumeric customer/member/student/case IDs).
  for (const m of text.matchAll(RE.labeledId)) {
    const label = m[1].toLowerCase();
    const val = m[2];
    const start = m.index + m[0].lastIndexOf(val);
    const entry = { category: 'account_number', rawValue: val, start, end: start + val.length };
    if (!WEAK_ID_LABELS.has(label) || weakIdQualifies(val)) raw.push(entry);
    else weakIds.push(entry);
  }
  detectKeywords(raw, text, RULES.healthKeywords, 'health');
  const finHits = detectKeywords(raw, text, RULES.financialKeywords, 'financial');
  if (!finHits) pushAll(raw, RE.currency, 'financial', text);
  detectKeywords(raw, text, RULES.legalKeywords, 'legal', { minDistinct: 2 });
  detectKeywords(raw, text, RULES.legalStrongKeywords, 'legal'); // strong single-term legal phrases
  // New protected-data categories (US + EU).
  detectKeywords(raw, text, RULES.educationKeywords, 'education');
  detectKeywords(raw, text, RULES.workplaceKeywords, 'workplace');
  detectKeywords(raw, text, RULES.specialCategoryKeywords, 'special_category');
  detectKeywords(raw, text, RULES.regulatedKeywords, 'regulated');
  detectKeywords(raw, text, RULES.restrictionKeywords, 'restriction');
  detectKeywords(raw, text, RULES.companySecretKeywords, 'company_secret');
  detectKeywords(raw, text, RULES.locationKeywords, 'location');
  detectChildren(raw, text);
  pushAll(raw, RE.gpsCoords, 'location', text);
  pushAll(raw, RE.privateIp, 'internal_url', text);
  for (const m of text.matchAll(/\bhttps?:\/\/[A-Za-z0-9.-]+\.(?:internal|local|corp|intra|lan|intranet)\b[^\s]*/gi)) {
    raw.push({ category: 'internal_url', rawValue: m[0], start: m.index, end: m.index + m[0].length });
  }

  // --- Medium: email, phone, address, source code ---
  pushAll(raw, RE.email, 'email', text);
  pushAll(raw, RE.phone, 'phone', text);
  pushAll(raw, RE.address, 'address', text);
  // File paths (document-metadata signal when pasted as text).
  pushAll(raw, RE.winPath, 'file_path', text);
  pushAll(raw, RE.uncPath, 'file_path', text);
  pushAll(raw, RE.unixPath, 'file_path', text);
  // Source code: fenced/inline blocks, or 2+ distinct code keywords.
  let codeFound = false;
  for (const m of text.matchAll(RE.codeFence)) {
    codeFound = true;
    raw.push({ category: 'source_code', rawValue: m[0], start: m.index, end: m.index + m[0].length });
    break;
  }
  if (!codeFound) {
    const lower = text.toLowerCase();
    const distinct = new Set(RULES.sourceCodeKeywords.filter((k) => lower.includes(k)));
    if (distinct.size >= 2) {
      const kw = RULES.sourceCodeKeywords.find((k) => lower.includes(k));
      const idx = lower.indexOf(kw);
      raw.push({ category: 'source_code', rawValue: text.slice(idx, idx + kw.length), start: idx, end: idx + kw.length });
    }
  }

  // --- Customer data: a personal name co-occurring with an identifier ---
  const hasIdentifier = raw.some((r) =>
    ['email', 'account_number', 'credit_card', 'ssn', 'phone'].includes(r.category)
  );
  // Weak labeled IDs ("order #12345") fire only alongside a real identifier —
  // "order #12345 shipped" stays safe; "order #12345 for jane@x.com" flags.
  if (weakIds.length && hasIdentifier) raw.push(...weakIds);
  const hasTicket = /\bticket\s*#?\s*\d{3,}\b/i.test(text) || /\bcustomer\b/i.test(text);
  if (hasIdentifier || hasTicket) {
    const STOP = new Set(['Dear', 'Hi', 'Hello', 'Best', 'Regards', 'Thanks', 'Thank', 'The', 'This', 'From', 'To']);
    // Emit EVERY name-shaped span (all hidden from the modal) so redaction
    // replaces all of them — a leftover name would otherwise re-fire on the
    // post-redact rescan and block "Looks good — send".
    for (const m of text.matchAll(RE.name)) {
      if (STOP.has(m[1])) continue;
      raw.push({ category: 'customer_data', rawValue: m[0], start: m.index, end: m.index + m[0].length, showInModal: false });
    }
  }

  // --- Resolve overlaps, build matches ---
  const deduped = deOverlap(raw);
  deduped.sort((a, b) => {
    const rd = RISK[CATEGORY[b.category].risk].rank - RISK[CATEGORY[a.category].risk].rank;
    return rd !== 0 ? rd : a.start - b.start;
  });

  const matches = deduped.map((m) => {
    const meta = CATEGORY[m.category];
    // Map spans back to the ORIGINAL (un-normalized) input so redaction and
    // highlighting replace the right characters even around zero-width chars.
    const span = toOrig ? toOrig(m.start, m.end) : m;
    return {
      type: meta.type,
      category: m.category,
      risk: meta.risk,
      rawValue: m.rawValue,
      maskedValue: maskFor(m.category, m.rawValue),
      start: span.start,
      end: span.end,
      showInModal: m.showInModal !== false,
    };
  });

  // --- Aggregate ---
  const categories = [...new Set(matches.map((m) => m.category))];
  const riskLevel = highestRisk(matches.map((m) => m.risk));
  // Summary reflects user-facing findings only (redaction-only signals such as
  // a bare customer name are excluded), matching the design's summary copy.
  const seen = new Set();
  const summary = matches
    .filter((m) => m.showInModal)
    .filter((m) => (seen.has(m.category) ? false : (seen.add(m.category), true)))
    .map((m) => CATEGORY[m.category].summary)
    .join(', ');

  return { riskLevel, categories, matches, summary, scanMs: +(now() - t0).toFixed(1) };
}

/**
 * Async wrapper for very large pastes (> ASYNC_THRESHOLD chars): yields to the
 * event loop once so the UI thread isn't blocked, then runs the same pure scan.
 */
/**
 * Remove muted categories from a detect() result and recompute the aggregate
 * fields. Pure — detection itself stays mode/mute-agnostic; muting is applied
 * by the orchestrator after the scan (mirrors how shouldInterrupt is applied).
 * @param {ReturnType<typeof detect>} result
 * @param {string[]} mutedCategories
 */
export function filterMatches(result, mutedCategories) {
  if (!mutedCategories || mutedCategories.length === 0) return result;
  const muted = new Set(mutedCategories);
  const matches = result.matches.filter((m) => !muted.has(m.category));
  if (matches.length === result.matches.length) return result;
  const categories = [...new Set(matches.map((m) => m.category))];
  const riskLevel = highestRisk(matches.map((m) => m.risk));
  const seen = new Set();
  const summary = matches
    .filter((m) => m.showInModal)
    .filter((m) => (seen.has(m.category) ? false : (seen.add(m.category), true)))
    .map((m) => CATEGORY[m.category].summary)
    .join(', ');
  return { ...result, matches, categories, riskLevel, summary };
}

export const ASYNC_THRESHOLD = 10000;
export function detectAsync(text) {
  if (typeof text === 'string' && text.length > ASYNC_THRESHOLD) {
    return new Promise((resolve) => setTimeout(() => resolve(detect(text)), 0));
  }
  return Promise.resolve(detect(text));
}

export const RISK_ORDER_REF = RISK_ORDER; // re-export for convenience
