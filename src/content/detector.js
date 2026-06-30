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
  source_code:    { type: 'Source code',      summary: 'source code',       redactLabel: '[CODE]',    risk: 'medium' },
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
  ccCandidate: /\b(?:\d[ -]?){13,16}\b/g,
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
  labeledId: /\b(?:account|acct|customer|member|student|patient|case|ticket|reference|ref|order|policy|claim|invoice|employee|badge)\b\s*(?:id|no\.?|number|#)?\s*[:#]?\s*#?\s*([A-Za-z]*\d[A-Za-z0-9-]{3,})\b/gi,
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
function detectGenericSecrets(out, text) {
  const tokenRe = /[A-Za-z0-9_\-+/=.]{20,}/g;
  for (const m of text.matchAll(tokenRe)) {
    const tok = m[0];
    if (tok.includes('@')) continue; // emails handled elsewhere
    const hasLetter = /[A-Za-z]/.test(tok);
    const hasDigit = /\d/.test(tok);
    if (!(hasLetter && hasDigit)) continue;
    if (shannonEntropy(tok) <= 4.0) continue;
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
      // word-ish boundary check for short alpha keywords
      hits.push({ kw, idx });
      from = idx + kw.length;
    }
  }
  if (hits.length === 0) return 0;
  if ((opts.minDistinct || 1) > new Set(hits.map((h) => h.kw)).size) return 0;
  // Emit one finding anchored at the first hit (keyword categories are signals,
  // not spans to redact individually).
  hits.sort((a, b) => a.idx - b.idx);
  const first = hits[0];
  out.push({
    category,
    rawValue: text.slice(first.idx, first.idx + first.kw.length),
    start: first.idx,
    end: first.idx + first.kw.length,
  });
  return hits.length;
}

// Children's data: explicit safeguarding/custody terms fire on their own;
// otherwise require a minor age co-occurring with a school/childcare cue.
function detectChildren(out, text) {
  const lower = text.toLowerCase();
  for (const kw of RULES.childrenKeywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      out.push({ category: 'children', rawValue: text.slice(idx, idx + kw.length), start: idx, end: idx + kw.length });
      return;
    }
  }
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
export function detect(text) {
  const t0 = now();
  const raw = [];

  if (typeof text !== 'string' || text.length === 0) {
    return { riskLevel: 'safe', categories: [], matches: [], summary: '', scanMs: 0 };
  }

  // --- Critical: secrets & regulated identifiers ---
  pushAll(raw, RE.apiPrefixed, 'api_key', text);
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
  pushAll(raw, RE.ccCandidate, 'credit_card', text, (m) => luhnValid(m[0].replace(/\D/g, '')));
  pushAll(raw, RE.ssn, 'ssn', text);
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
  for (const m of text.matchAll(RE.account)) {
    raw.push({ category: 'account_number', rawValue: m[0].trim(), start: m.index + m[0].indexOf('#'), end: m.index + m[0].length });
  }
  for (const m of text.matchAll(RE.accountWord)) {
    const val = m[1];
    const start = m.index + m[0].lastIndexOf(val);
    raw.push({ category: 'account_number', rawValue: val, start, end: start + val.length });
  }
  // Broader labeled identifiers (alphanumeric customer/member/student/case IDs).
  for (const m of text.matchAll(RE.labeledId)) {
    const val = m[1];
    const start = m.index + m[0].lastIndexOf(val);
    raw.push({ category: 'account_number', rawValue: val, start, end: start + val.length });
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
  const hasTicket = /\bticket\s*#?\s*\d{3,}\b/i.test(text) || /\bcustomer\b/i.test(text);
  if (hasIdentifier || hasTicket) {
    const STOP = new Set(['Dear', 'Hi', 'Hello', 'Best', 'Regards', 'Thanks', 'Thank', 'The', 'This', 'From', 'To']);
    for (const m of text.matchAll(RE.name)) {
      if (STOP.has(m[1])) continue;
      raw.push({ category: 'customer_data', rawValue: m[0], start: m.index, end: m.index + m[0].length, showInModal: false });
      break; // one representative name is enough
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
    return {
      type: meta.type,
      category: m.category,
      risk: meta.risk,
      rawValue: m.rawValue,
      maskedValue: maskFor(m.category, m.rawValue),
      start: m.start,
      end: m.end,
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
export const ASYNC_THRESHOLD = 10000;
export function detectAsync(text) {
  if (typeof text === 'string' && text.length > ASYNC_THRESHOLD) {
    return new Promise((resolve) => setTimeout(() => resolve(detect(text)), 0));
  }
  return Promise.resolve(detect(text));
}

export const RISK_ORDER_REF = RISK_ORDER; // re-export for convenience
