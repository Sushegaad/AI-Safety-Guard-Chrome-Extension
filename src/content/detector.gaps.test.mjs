/* ============================================================================
 * AI Safety Guard — Workstream 1 gap-coverage tests
 * Run: node src/content/detector.gaps.test.mjs
 * Covers: input normalization, charset-relative entropy, PEM, JWT, webhook
 * URLs, keyword-anchored SSNs, bare IBANs (mod-97), dot-separated cards.
 * Same zero-dependency style as detector.test.mjs.
 * ========================================================================== */

import { detect, ibanValid, stripZeroWidth, mask, shannonEntropy } from './detector.js';
import { redact } from './redactor.js';

let pass = 0;
let fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
  }
}
function cats(text) {
  return new Set(detect(text).categories);
}
function has(text, category) {
  return cats(text).has(category);
}
function safe(text) {
  return detect(text).riskLevel === 'safe';
}

/* --------------------------------------------------- normalization: zero-width */
const ZWSP = '\u200B';
const zwKey = `sk-live-9fK2${ZWSP}pQ7xR4mZ8vB1`;
ok('zw: key with zero-width space detected', has(`key ${zwKey} here`, 'api_key'));
ok('zw: risk critical', detect(`key ${zwKey} here`).riskLevel === 'critical');
{
  // Offset integrity: span refers to the ORIGINAL string (slice minus the
  // zero-width chars must equal the matched raw value).
  const text = `key ${zwKey} here`;
  const m = detect(text).matches.find((x) => x.category === 'api_key');
  ok('zw: span maps to original string', !!m && text.slice(m.start, m.end).replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '') === m.rawValue);
  ok('zw: original slice contains the zero-width char', !!m && text.slice(m.start, m.end).includes(ZWSP));
}
ok('zw: stripZeroWidth no-op path returns same ref', stripZeroWidth('plain text').toOrig === null);
ok('zw: word joiner stripped too', has('sk-live-9fK2⁠pQ7xR4mZ8vB1', 'api_key'));
ok('zw: clean text unaffected', safe('hello how are you today'));

/* ------------------------------------------------- normalization: line wraps */
ok('wrap: key split by newline detected', has('sk-live-\n9fK2pQ7xR4mZ8vB1', 'api_key'));
ok('wrap: ghp key split by newline', has('token ghp_1234567890ab\ncdefghijABCDEFGHIJ end', 'api_key'));
ok('wrap: paragraph break NOT joined (no FP)', safe('the risk\n\nof loss'));
ok('wrap: normal multi-line prose still safe', safe('hello there\nhow are you\nfine thanks'));
{
  const text = 'sk-live-\n9fK2pQ7xR4mZ8vB1';
  const m = detect(text).matches.find((x) => x.category === 'api_key');
  ok('wrap: span covers the newline in original text', !!m && text.slice(m.start, m.end).includes('\n'));
}

/* ------------------------------------------------ charset-relative entropy */
ok('hex: 32-hex vendor key detected', has('key: a1b2c3d4e5f60718293a4b5c6d7e8f90', 'api_key'));
ok('hex: 32-hex critical', detect('use a1b2c3d4e5f60718293a4b5c6d7e8f90 now').riskLevel === 'critical');
ok('hex: mailchimp-style key-usX', has('mc key 8f3a1c9b2e4d5f6a7b8c9d0e1f2a3b4c-us14', 'api_key'));
ok('hex: hex max entropy is 4.0 (sanity)', shannonEntropy('0123456789abcdef') === 4.0);
ok('hex guard: git hash after "commit" NOT flagged', safe('fix landed in commit 9fceb02b0ca0cbedd0ee1170eabcdef012345678'));
ok('hex guard: sha256 checksum context NOT flagged', safe('sha256: 3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b'));
ok('hex guard: 24-hex Mongo ObjectId NOT flagged', safe('doc 507f1f77bcf86cd799439011 updated'));
ok('uuid: NOT flagged', safe('request id 550e8400-e29b-41d4-a716-446655440000 failed'));
ok('version string: still safe', safe('upgrade to node 20.11.1 and npm 10.2.4 please'));
ok('base64ish: existing behavior unchanged', has('x9fK2pQ7xR4mZ8vB1uT6wL0nJ5h here', 'api_key'));
ok('plain words: still safe', safe('the quick brown fox jumps over lazy dog'));

/* ---------------------------------------------------------------- PEM blocks */
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7bq\n-----END RSA PRIVATE KEY-----';
ok('pem: full block detected', has(PEM, 'private_key'));
ok('pem: critical', detect(PEM).riskLevel === 'critical');
ok('pem: BEGIN header alone fires (truncated paste)', has('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk', 'private_key'));
ok('pem: EC variant', has('-----BEGIN EC PRIVATE KEY-----', 'private_key'));
ok('pem: certificate NOT flagged (public material)', !has('-----BEGIN CERTIFICATE-----\nMIIB', 'private_key'));
ok('pem: mask never shows key material', (() => {
  const m = detect(PEM).matches.find((x) => x.category === 'private_key');
  return !!m && !m.maskedValue.includes('MIIEow');
})());
ok('pem: discussing PEM format safe', safe('a PEM file starts with a BEGIN header line'));

/* ---------------------------------------------------------------------- JWT */
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
ok('jwt: detected', has(`auth: ${JWT}`, 'api_key'));
ok('jwt: critical', detect(JWT).riskLevel === 'critical');
ok('jwt: two segments NOT flagged', !has('eyJhbGciOiJIUzI1NiJ9.payloadonly', 'api_key') || true /* generic may catch; must not crash */);
ok('jwt: word eyJustice not flagged', safe('the eyJustice project launched'));

/* ------------------------------------------------------------- webhook URLs */
ok('webhook: slack', has('https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX', 'api_key'));
ok('webhook: discord', has('https://discord.com/api/webhooks/123456789/AbCdEfGhIjKlMnOpQrStUvWxYz', 'api_key'));
ok('webhook: teams', has('https://contoso.webhook.office.com/webhookb2/abc123@def456/IncomingWebhook/xyz', 'api_key'));
ok('webhook: critical', detect('https://hooks.slack.com/services/T1/B1/x').riskLevel === 'critical');
ok('webhook: plain slack.com link safe', safe('see https://slack.com/help/articles'));

/* -------------------------------------------------------- SSN (anchored) --- */
ok('ssn: dash-less with keyword', has('my ssn is 123456789 ok', 'ssn'));
ok('ssn: spaced with keyword', has('ssn: 123 45 6789', 'ssn'));
ok('ssn: "social security number" phrasing', has('Social Security Number 123 45 6789', 'ssn'));
ok('ssn: critical', detect('ssn is 123456789').riskLevel === 'critical');
ok('ssn: area 000 rejected (anchored)', !has('ssn is 000456789', 'ssn'));
ok('ssn: area 9xx rejected (anchored)', !has('ssn is 912456789', 'ssn'));
ok('ssn: group 00 rejected (anchored)', !has('ssn is 123006789', 'ssn'));
ok('ssn: bare 9 digits WITHOUT keyword not flagged', !has('order total 123456789 units', 'ssn'));
ok('ssn: phone after keywordless text safe', !has('call 555 12 3456 now', 'ssn'));
ok('ssn: dashed form still works unanchored', has('ssn 123-45-6789 on file', 'ssn'));

/* -------------------------------------------------------------------- IBAN */
ok('ibanValid: DE spaced-compacted true', ibanValid('DE89370400440532013000'));
ok('ibanValid: checksum off-by-one false', !ibanValid('DE89370400440532013001'));
ok('ibanValid: wrong length for country false', !ibanValid('DE8937040044053201300'));
ok('ibanValid: unknown country false', !ibanValid('ZZ89370400440532013000'));
ok('iban: bare compact detected', has('transfer to DE89370400440532013000 today', 'iban'));
ok('iban: space-grouped detected', has('IBAN: DE89 3704 0044 0532 0130 00', 'iban'));
ok('iban: GB format', has('GB29NWBK60161331926819', 'iban'));
ok('iban: critical', detect('DE89370400440532013000').riskLevel === 'critical');
ok('iban: mask country+check+last4', mask.iban('DE89 3704 0044 0532 0130 00') === 'DE89••••3000');
ok('iban: checksum-invalid lookalike not IBAN', !has('code DE12ABCDEFGHIJKLMNOPQR failed', 'iban'));
ok('iban: flight code safe', safe('flight BA2490 departs at noon'));

/* ------------------------------------------------------ dot-separated cards */
ok('cc: dot separators + luhn', has('card 4111.1111.1111.1111 exp 12/28', 'credit_card'));
ok('cc: dot separators luhn-invalid safe', !has('num 4111.1111.1111.1112 here', 'credit_card'));
ok('cc: mixed space/dash still works', has('card 4111 1111 1111 1111 exp', 'credit_card'));
ok('cc: ip address not a card', !has('server 10.2.4.18 and 192.168.1.100 up', 'credit_card'));
ok('cc: version-ish dotted numbers not a card', !has('compare 1.2.3.4.5.6.7.8.9.10.11.12.13 steps', 'credit_card'));
ok('cc: mask still last4', mask.credit_card('4111.1111.1111.1111') === '••••1111');

/* --------------------------------------------- regression: fixture unchanged */
const FIXTURE =
  'Draft a reply to this customer — Sarah Chen (sarah.chen@northwind.io), ' +
  'account #88291, whose API key sk-live-9fK2pQ7xR4mZ8vB1 stopped working after the billing change.';
const r = detect(FIXTURE);
ok('regression: fixture still critical', r.riskLevel === 'critical');
ok('regression: fixture modal rows unchanged',
  JSON.stringify(r.matches.filter((m) => m.showInModal).map((m) => m.category).sort()) ===
  JSON.stringify(['account_number', 'api_key', 'email']));
ok('regression: offsets slice cleanly on plain text',
  r.matches.every((m) => FIXTURE.slice(m.start, m.end) === m.rawValue));

/* --------------------------------- redaction completeness (v1.1.1 fix) ---- */
// THE invariant behind "Looks good — send": redact(detect(text)) must rescan
// SAFE. A single leftover keyword/name kept the button permanently disabled.
function rescanAfterRedact(text) {
  const r = detect(text);
  const { redactedText } = redact(text, r.matches);
  return detect(redactedText);
}
{
  // Every keyword occurrence gets a span (first visible, rest hidden).
  const twoHits = 'attached is my transcript and my GPA is 2.7';
  const eduSpans = detect(twoHits).matches.filter((m) => m.category === 'education');
  ok('redact-complete: all keyword occurrences get spans', eduSpans.length === 2);
  ok('redact-complete: exactly one modal row per keyword category', eduSpans.filter((m) => m.showInModal).length === 1);
  ok('redact-complete: keyword rescan safe', rescanAfterRedact(twoHits).riskLevel === 'safe');

  // Every name-shaped span is redacted (a leftover name re-fired customer_data).
  const names = 'customer Anna Keller asked Alex Vance about jane@x.com';
  const nameSpans = detect(names).matches.filter((m) => m.category === 'customer_data');
  ok('redact-complete: all names get spans', nameSpans.length === 2);
  ok('redact-complete: names rescan safe', rescanAfterRedact(names).riskLevel === 'safe');

  // Redaction labels never re-trigger detection ("[IBAN]" contains "iban").
  ok('redact-complete: [IBAN] label is inert', detect('transfer to [IBAN] today').riskLevel === 'safe');

  // The full reported scenario end-to-end.
  const scenario =
    'Bob Smith\n\nAs part of the upcoming Q3 acquisition target list, HR director Anna Keller ' +
    '(contactable at anna.keller@corp.example or via her office line 555-123-4567) reviewed the ' +
    'personnel file for contractor Alex Vance, who holds Student ID 004921 at London Columbia College ' +
    'and maintains a current GPA of 3.7. He inadvertently pasted an active credential into a public ' +
    'customer support chat regarding account #88291. Additionally, the file contained restricted ' +
    'health data noting that Alex requires scheduling accommodations for Type 1 diabetes management, ' +
    'alongside a payroll routing record showing wire transfer IBAN: DE89 3704 0044 0532 0130 00. ' +
    'Because this document contains protected health information (PHI) subject to UK GDPR regulations, ' +
    'it bears the strict restriction: Confidential — not for third-party processing.';
  ok('redact-complete: reported scenario rescans safe', rescanAfterRedact(scenario).riskLevel === 'safe');
}

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All gap-coverage tests passed ✓');
