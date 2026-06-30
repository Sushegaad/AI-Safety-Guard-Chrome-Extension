/* ============================================================================
 * AI Safety Guard — Detection Engine tests
 * Run: npm test   (node src/content/detector.test.mjs)
 * Pure assertions, no test framework. Exits non-zero on any failure.
 * ========================================================================== */

import {
  detect,
  detectAsync,
  shannonEntropy,
  luhnValid,
  mask,
} from './detector.js';
import { debounce } from '../shared/debounce.js';

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

/* ------------------------------------------------------------------ entropy */
ok('entropy: repeated char ~0', shannonEntropy('aaaaaaaa') < 0.01);
ok('entropy: random string > 4.0', shannonEntropy('9fK2pQ7xR4mZ8vB1aZ3k') > 4.0);
ok('entropy: english word < 4.0', shannonEntropy('password') < 4.0);

/* --------------------------------------------------------------------- Luhn */
ok('luhn: valid visa', luhnValid('4111111111111111'));
ok('luhn: valid mastercard', luhnValid('5500005555555559'));
ok('luhn: invalid number', !luhnValid('4111111111111112'));
ok('luhn: wrong length', !luhnValid('411111'));

/* ---------------------------------------------------- per-category good/bad */
// Email — MEDIUM
ok('email good', has('reach me at jane.doe@example.com please', 'email'));
ok('email bad (no false positive)', !has('the price is 5@ a pound', 'email'));
ok('email risk medium', detect('a@b.com').riskLevel === 'medium');

// Phone — MEDIUM
ok('phone good dashed', has('call 555-123-4567 today', 'phone'));
ok('phone good intl', has('ring +1 (415) 555-2671 now', 'phone'));
ok('phone bad (random digits)', !has('order 12 34 of item 9988', 'phone'));

// Address — MEDIUM
ok('address good', has('ship to 123 Main Street, Springfield, IL 62704', 'address'));
ok('address bad', !has('meeting in room 200 upstairs', 'address'));

// Credit card — CRITICAL + Luhn
ok('cc good (luhn valid)', has('card 4111 1111 1111 1111 exp', 'credit_card'));
ok('cc bad (luhn invalid not flagged)', !has('num 4111 1111 1111 1112 here', 'credit_card'));
ok('cc risk critical', detect('4111111111111111').riskLevel === 'critical');

// SSN — CRITICAL
ok('ssn good', has('ssn 123-45-6789 on file', 'ssn'));
ok('ssn bad (000 area excluded)', !has('id 000-45-6789 invalid', 'ssn'));
ok('ssn bad (666 area excluded)', !has('id 666-45-6789 invalid', 'ssn'));

// API keys — CRITICAL
ok('api good sk-live', has('key sk-live-9fK2pQ7xR4mZ8vB1 here', 'api_key'));
ok('api good ghp', has('token ghp_1234567890abcdefghijABCDEFGHIJ', 'api_key'));
ok('api good AKIA', has('aws AKIAIOSFODNN7EXAMPLE creds', 'api_key'));
ok('api good generic high-entropy', has('x9fK2pQ7xR4mZ8vB1uT6wL0nJ5h here', 'api_key'));
ok('api bad (plain words)', !has('the quick brown fox jumps over lazy dog', 'api_key'));

// Passwords — CRITICAL
ok('password assign good', has('password: hunter2xyz', 'password'));
ok('password json good', has('"api_key":"abc12345"', 'api_key') || has('"api_key":"abc12345"', 'password'));
ok('password bad', !has('please reset it later', 'password'));

// Account numbers — HIGH
ok('account # good', has('account #88291 is overdue', 'account_number'));
ok('account word good', has('acct number 778812 closed', 'account_number'));

// Health — HIGH
ok('health good', has('patient diagnosis: hypertension, prescription attached', 'health'));
ok('health bad', !has('the weather is nice today', 'health'));

// Financial — HIGH
ok('financial keyword good', has('Q3 revenue and EBITDA grew', 'financial'));
ok('financial currency good', has('we wired $1,250,000.00 yesterday', 'financial'));

// Legal — HIGH (needs 2+ distinct terms)
ok('legal good (2 terms)', has('this is confidential and attorney-client privileged', 'legal'));
ok('legal bad (1 term only)', !has('please keep this confidential', 'legal'));

// Internal URLs — HIGH
ok('internal ip good', has('deploy to 10.2.4.18:8080 tonight', 'internal_url'));
ok('internal tld good', has('see http://wiki.corp.internal/page', 'internal_url'));
ok('internal bad (public)', !has('visit https://example.com/home', 'internal_url'));

// Source code — MEDIUM/HIGH
ok('code fence good', has('here:\n```\nconst x = 1;\n```\n', 'source_code'));
ok('code keywords good', has('function foo() { return bar; }', 'source_code'));

// Customer data — name + identifier
ok('customer name detected with identifier', has('summarize note from Sarah Chen, account #88291', 'customer_data'));
ok('lone name NOT flagged', !has('I spoke with Sarah Chen yesterday about lunch', 'customer_data'));

/* ----------------------------------------- expanded coverage (US + EU) v2 */
// Government IDs — CRITICAL (keyword-anchored)
ok('gov: passport', has('Passport: YA1234567', 'gov_id'));
ok('gov: passport critical', detect('Passport: YA1234567').riskLevel === 'critical');
ok('gov: drivers license', has("driver's license D1234567", 'gov_id'));
ok('gov: national insurance', has('National Insurance Number QQ123456C', 'gov_id'));
ok('gov: no false positive (no digit)', !has('please bring your passport tomorrow', 'gov_id'));

// Education — HIGH
ok('education: student id + gpa', has('Student ID 004921, GPA 2.7', 'education'));
ok('education: transcript', has('attached is my transcript', 'education'));

// Workplace / HR — HIGH (also covers salary)
ok('workplace: PIP', has('Put Alex on a performance improvement plan', 'workplace'));
ok('workplace: salary', has("Alex's salary is 95000", 'workplace'));

// Special-category (GDPR Art. 9) — HIGH
ok('special: union rep', has('Employee is a union representative', 'special_category'));
ok('special: no bare-race FP', !has('I race go-karts on the weekend', 'special_category'));

// Regulated-data signals — HIGH
ok('regulated: PCI cardholder', has('PCI cardholder data attached', 'regulated'));
ok('regulated: HIPAA', has('this falls under HIPAA', 'regulated'));

// Restriction / consent — HIGH (a single strong term fires)
ok('restriction: not-for-third-party', has('Confidential — not for third-party processing', 'restriction'));
ok('restriction: strong phrase fires', has('strictly confidential — do not forward', 'restriction'));
ok('restriction: lone confidential no longer fires (noise reduced)', !has('please keep this confidential', 'restriction'));
ok('restriction does not make it "legal"', !has('please keep this confidential', 'legal')); // legal still needs 2

// Company secrets — HIGH
ok('company: acquisition target', has('Q3 acquisition target list', 'company_secret'));
ok('company: no bare-roadmap FP', !has('the project roadmap looks good', 'company_secret'));

// Children's data — HIGH
ok('children: age + school', has('Lucas, age 9, attends Lincoln Elementary', 'children'));
ok('children: safeguarding term', has('safeguarding notes for the pupil', 'children'));

// Location / tracking — HIGH
ok('location: badge entry', has('Employee badge entry: Berlin office, 08:13', 'location'));
ok('location: gps coords', has('meet at 52.5200, 13.4050 tonight', 'location'));

// File paths — MEDIUM
ok('file path: windows', has('see C:\\Users\\Mike\\report.docx', 'file_path'));

// Labeled / alphanumeric identifiers — HIGH
ok('labeled id: alphanumeric account', has('Customer account #A83921 reported fraud', 'account_number'));

// new masks
ok('mask gov_id last4', mask.gov_id('YA1234567') === '••••4567');
ok('mask file_path basename', mask.file_path('C:\\Users\\Mike\\report.docx') === '…\\report.docx');

/* ----------------------------- US + EU protected-data requirements matrix */
// Each of the 16 requested categories must flag (non-safe) with a sensible label.
const REQUIREMENTS = [
  ['personal identifier (address)', 'Anna Keller, 24 King Street, London', 'address'],
  ['government ID — SSN', 'SSN: 123-45-6789', 'ssn'],
  ['government ID — passport', 'Passport: YA1234567', 'gov_id'],
  ['financial — IBAN', 'IBAN: DE89 3704 0044 0532 0130 00', 'financial'],
  ['health', 'Patient has Type 1 diabetes and takes insulin', 'health'],
  ['student & education', 'Student ID 004921, GPA 2.7', 'education'],
  ["children's data", 'Lucas, age 9, attends Lincoln Elementary', 'children'],
  ['special-category (GDPR Art. 9)', 'Employee is a union representative', 'special_category'],
  ['workplace-sensitive', 'Put Alex on a performance improvement plan', 'workplace'],
  ['customer & support', 'Customer account #A83921 reported fraud', 'account_number'],
  ['legal — settlement', 'Settlement offer is $85,000', 'legal'],
  ['company secrets', 'Q3 acquisition target list', 'company_secret'],
  ['credentials — env placeholder', 'AWS_SECRET_ACCESS_KEY=...', 'password'],
  ['location & tracking', 'Employee badge entry: Berlin office, 08:13', 'location'],
  ['document metadata — file path', 'C:\\Users\\Mike\\report.docx', 'file_path'],
  ['regulated signal — PCI', 'PCI cardholder data', 'regulated'],
  ['consent / restriction', 'Confidential — not for third-party processing', 'restriction'],
];
for (const [label, text, category] of REQUIREMENTS) {
  ok(`req: ${label} is flagged`, detect(text).riskLevel !== 'safe');
  ok(`req: ${label} -> ${category}`, has(text, category));
}
// The two label-gap fixes specifically:
ok('req: settlement reads as legal (not just financial)', has('Settlement offer is $85,000', 'legal'));
ok('req: env secret placeholder is critical', detect('AWS_SECRET_ACCESS_KEY=...').riskLevel === 'critical');
// Env-secret false-positive guards (must NOT flag ordinary uppercase config):
ok('req: PRIMARY_KEY not a secret', !has('PRIMARY_KEY = id', 'password'));
ok('req: MAX_TOKENS not a secret', !has('MAX_TOKENS=100', 'password'));

/* ----------------------------------------------------------------- masking */
ok('mask email', mask.email('sarah.chen@northwind.io') === 'sarah.chen@…');
ok('mask account', mask.account_number('#88291') === '#88•••');
ok('mask api sk-live', mask.api_key('sk-live-9fK2pQ7xR4mZ8vB1') === 'sk-live-••••');
ok('mask cc last4', mask.credit_card('4111-1111-1111-1111') === '••••1111');
ok('mask ssn last4', mask.ssn('123-45-6789') === '•••-••-6789');
ok('mask password hidden', mask.password('whatever') === '••••••••');
ok('mask never reveals raw', !mask.api_key('sk-live-9fK2pQ7xR4mZ8vB1').includes('9fK2pQ'));

/* ------------------------------------------------ risk aggregation (max wins) */
ok('agg: medium only', detect('email a@b.com and phone 555-123-4567').riskLevel === 'medium');
ok('agg: high beats medium', detect('account #88291 and email a@b.com').riskLevel === 'high');
ok('agg: critical beats all', detect('sk-live-9fK2pQ7xR4mZ8vB1 with account #88291').riskLevel === 'critical');
ok('agg: safe when nothing', detect('hello how are you today').riskLevel === 'safe');
ok('every match carries maskedValue', detect('sk-live-9fK2pQ7xR4mZ8vB1 a@b.com #88291').matches.every((m) => typeof m.maskedValue === 'string' && m.maskedValue.length > 0));

/* ----------------------------------------------- REGRESSION: A2 modal example */
const FIXTURE =
  'Draft a reply to this customer — Sarah Chen (sarah.chen@northwind.io), ' +
  'account #88291, whose API key sk-live-9fK2pQ7xR4mZ8vB1 stopped working after the billing change.';
const r = detect(FIXTURE);
const byCat = Object.fromEntries(r.matches.map((m) => [m.category, m]));
ok('fixture: riskLevel critical', r.riskLevel === 'critical');
ok('fixture: email detected + masked', byCat.email && byCat.email.maskedValue === 'sarah.chen@…');
ok('fixture: account detected + masked', byCat.account_number && byCat.account_number.maskedValue === '#88•••');
ok('fixture: api key detected + masked', byCat.api_key && byCat.api_key.maskedValue === 'sk-live-••••');
ok('fixture: name detected for [NAME] redaction', byCat.customer_data && byCat.customer_data.rawValue === 'Sarah Chen');
ok('fixture: name not shown in modal', byCat.customer_data && byCat.customer_data.showInModal === false);
// The three modal rows (showInModal) are exactly api_key, account_number, email.
const modalCats = r.matches.filter((m) => m.showInModal).map((m) => m.category).sort();
ok('fixture: modal shows exactly 3 findings', JSON.stringify(modalCats) === JSON.stringify(['account_number', 'api_key', 'email']));
ok('fixture: modal order critical-first', r.matches.filter((m) => m.showInModal)[0].category === 'api_key');
ok('fixture: raw secret never in any maskedValue', r.matches.every((m) => !m.maskedValue.includes('9fK2pQ7xR4mZ8vB1')));
ok('fixture: summary copy', r.summary.startsWith('API key, account number, email'));

/* ------------------------------------------------------------- performance */
const big = (FIXTURE + ' ').repeat(Math.ceil(4000 / FIXTURE.length)); // ~4000+ chars
const N = 20;
let total = 0;
let last;
for (let i = 0; i < N; i++) {
  const s = performance.now();
  last = detect(big.slice(0, 4000));
  total += performance.now() - s;
}
const avg = total / N;
ok(`perf: <50ms @ 4000 chars (avg ${avg.toFixed(1)}ms)`, avg < 50);
ok('perf: scanMs recorded', typeof last.scanMs === 'number' && last.scanMs >= 0);

/* ------------------------------------------------------- async large pastes */
const huge = 'lorem ipsum '.repeat(1200); // > 10000 chars
const asyncResult = await detectAsync(huge);
ok('async: resolves for >10k chars', asyncResult && typeof asyncResult.riskLevel === 'string');
ok('async: small input still resolves', (await detectAsync('a@b.com')).riskLevel === 'medium');

/* --------------------------------------------------------------- debounce */
await new Promise((resolve) => {
  let calls = 0;
  const d = debounce(() => calls++, 30);
  d();
  d();
  d();
  setTimeout(() => {
    ok('debounce: collapses rapid calls to one', calls === 1);
    resolve();
  }, 60);
});

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All detector tests passed ✓');
