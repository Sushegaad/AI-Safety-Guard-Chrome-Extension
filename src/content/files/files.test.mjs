/* ============================================================================
 * AI Safety Guard — File attachment scanning tests
 * Run: node src/content/files/files.test.mjs
 * Covers DOCX extraction (real fflate zip), PDF page-walk (mock doc), file-kind
 * classification, the attach watcher, and the file warning modal.
 * ========================================================================== */

import { JSDOM } from 'jsdom';
import { zipSync, strToU8 } from 'fflate';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://chatgpt.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.chrome = { runtime: { getURL: (p) => 'chrome-extension://test/' + p } };

const { extractDocxText } = await import('./docx.js');
const { extractFromDoc } = await import('./pdf.js');
const { fileKind, extractText } = await import('./extract.js');
const { initAttachWatcher } = await import('./attach.js');
const { detect } = await import('../detector.js');
const { createModal } = await import('../ui/modal.js');
const { bytesToBase64, base64ToBytes } = await import('../../shared/base64.js');

let pass = 0;
let fail = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : (fail++, fails.push(n)));
const tick = () => new Promise((r) => setTimeout(r, 0));

const SECRET = 'email sarah.chen@northwind.io and key sk-live-9fK2pQ7xR4mZ8vB1';

// Build a minimal but real .docx (zip of XML parts) including a comment.
function makeDocx() {
  const docXml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Body: ${SECRET}</w:t></w:r></w:p></w:body></w:document>`;
  const commentsXml = `<?xml version="1.0"?><w:comments><w:comment><w:p><w:r><w:t>Reviewer note: account #88291</w:t></w:r></w:p></w:comment></w:comments>`;
  const coreXml = `<?xml version="1.0"?><cp:coreProperties><dc:creator>Jane Author</dc:creator></cp:coreProperties>`;
  return zipSync({
    'word/document.xml': strToU8(docXml),
    'word/comments.xml': strToU8(commentsXml),
    'docProps/core.xml': strToU8(coreXml),
  });
}

/* ------------------------------------------------ DOCX extraction (real) */
{
  const zip = makeDocx();
  const text = extractDocxText(zip);
  ok('docx: extracts body text', text.includes('sarah.chen@northwind.io'));
  ok('docx: extracts secret in body', text.includes('sk-live-9fK2pQ7xR4mZ8vB1'));
  ok('docx: extracts comments (hidden PII)', text.includes('#88291'));
  ok('docx: extracts metadata (author)', text.includes('Jane Author'));
  ok('docx: strips xml tags', !text.includes('<w:t>'));
  ok('docx: invalid zip -> empty', extractDocxText(new Uint8Array([1, 2, 3])) === '');
  // and the detector finds PII in the extracted text
  const r = detect(text);
  ok('docx: detector flags extracted content', r.riskLevel === 'critical' && r.matches.some((m) => m.category === 'email'));
}

/* ---------------------------------------------- PDF page-walk (mock doc) */
{
  const mockDoc = {
    numPages: 2,
    getPage: async (p) => ({
      getTextContent: async () => ({ items: [{ str: 'sarah.chen@northwind.io' }, { str: 'p' + p }] }),
    }),
  };
  const text = await extractFromDoc(mockDoc);
  ok('pdf: walks all pages', text.includes('p1') && text.includes('p2'));
  ok('pdf: joins text content', text.includes('sarah.chen@northwind.io'));
}

/* ---------------------------------------------------- file-kind dispatch */
{
  ok('kind: docx by ext', fileKind({ name: 'Resume.DOCX' }) === 'docx');
  ok('kind: docx by mime', fileKind({ type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) === 'docx');
  ok('kind: pdf by ext', fileKind({ name: 'contract.pdf' }) === 'pdf');
  ok('kind: pdf by mime', fileKind({ type: 'application/pdf' }) === 'pdf');
  ok('kind: other', fileKind({ name: 'notes.txt' }) === 'other');

  // extractText dispatch for a docx "File"
  const zip = makeDocx();
  const fakeFile = {
    name: 'doc.docx',
    type: '',
    size: zip.length,
    arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
  };
  const res = await extractText(fakeFile);
  ok('extractText: docx supported + text', res.supported && res.text.includes('sarah.chen@northwind.io'));
  const other = await extractText({ name: 'x.txt', type: 'text/plain', size: 5 });
  ok('extractText: unsupported -> supported:false', other.supported === false);

  // PDF is not parsed inline; it is flagged for offscreen handling.
  const pdf = await extractText({ name: 'contract.pdf', type: 'application/pdf', size: 100 });
  ok('extractText: pdf -> needsOffscreen (no inline parse)', pdf.kind === 'pdf' && pdf.needsOffscreen === true && pdf.text === '');
}

/* ----------------------------------------------- base64 transfer round-trip */
{
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
  const round = base64ToBytes(bytesToBase64(bytes));
  ok('base64: round-trips bytes exactly', round.length === bytes.length && round.every((b, i) => b === bytes[i]));
}

/* ------------------------------------------------------- attach watcher */
{
  let got = null;
  initAttachWatcher((files) => (got = files), () => true, document);

  // drop event with files
  const dropEv = new dom.window.Event('drop', { bubbles: true });
  dropEv.dataTransfer = { files: [{ name: 'a.pdf' }] };
  document.dispatchEvent(dropEv);
  ok('attach: drop with files fires onAttach', got && got.length === 1 && got[0].name === 'a.pdf');

  // file input change
  got = null;
  const input = document.createElement('input');
  input.type = 'file';
  document.body.appendChild(input);
  Object.defineProperty(input, 'files', { value: [{ name: 'b.docx' }], configurable: true });
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  ok('attach: file input change fires onAttach', got && got[0].name === 'b.docx');

  // disabled -> no fire (fresh document so no other watcher is attached)
  const dom2 = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  let got2 = null;
  initAttachWatcher((f) => (got2 = f), () => false, dom2.window.document);
  const d2 = new dom2.window.Event('drop', { bubbles: true });
  d2.dataTransfer = { files: [{ name: 'c.pdf' }] };
  dom2.window.document.dispatchEvent(d2);
  ok('attach: respects disabled flag', got2 === null);
}

/* ------------------------------------------------- file warning modal */
{
  const modal = createModal();
  const result = detect(SECRET + ' account #88291');
  modal.openFile({
    title: 'This file may contain private data',
    subtitle: '"contract.docx" includes the items below.',
    findings: result.matches,
  });
  const host = document.getElementById('asg-modal-host');
  const root = host.shadowRoot;
  ok('file modal: title shown', root.textContent.includes('This file may contain private data'));
  ok('file modal: findings rows', root.querySelectorAll('.asg-find').length >= 2);
  ok('file modal: masked api key (not raw)', root.textContent.includes('sk-live-••••') && !root.textContent.includes('sk-live-9fK2pQ7xR4mZ8vB1'));
  ok('file modal: local note', root.textContent.includes('The file was not uploaded by us'));
  ok('file modal: role=dialog (a11y)', root.querySelector('.asg-card').getAttribute('role') === 'dialog');
  const gotIt = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it');
  ok('file modal: Got it button closes', !!gotIt);
  gotIt.click();
  await tick();
  ok('file modal: closed after Got it', !document.getElementById('asg-modal-host'));
}

/* ----------------------------------------------------------------- report */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All file-scanning tests passed ✓');
