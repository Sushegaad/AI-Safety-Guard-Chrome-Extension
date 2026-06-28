/* ============================================================================
 * AI Safety Guard — DOM read/write helpers
 * ----------------------------------------------------------------------------
 * AI tools use either <textarea> or div[contenteditable]. Reading and writing
 * differ, and contenteditable sites need a synthetic 'input' event so their own
 * framework (React/etc.) notices the change.
 * ========================================================================== */

export function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || el.isContentEditable;
}

/** Read the user's current prompt text from the input element. */
export function readInput(el) {
  if (!el) return '';
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
  return el.innerText || '';
}

/**
 * Write text back into the input and notify the host site's framework.
 *
 * Rich editors (Claude=ProseMirror, Gemini=Quill) keep their own document model
 * and ignore a raw `innerText =` assignment — they'd re-render from the model and
 * drop our change. For contenteditable we therefore select-all and use
 * execCommand('insertText'), which dispatches the beforeinput/input events those
 * editors listen to, so the replacement actually sticks. We fall back to
 * innerText + input event if execCommand is unavailable (older engines / tests).
 */
export function writeInput(el, text) {
  if (!el) return;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // contenteditable
  let inserted = false;
  try {
    el.focus();
    const sel = el.ownerDocument.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      sel.addRange(range);
    }
    if (typeof el.ownerDocument.execCommand === 'function') {
      inserted = el.ownerDocument.execCommand('insertText', false, text);
    }
  } catch {
    inserted = false;
  }
  if (!inserted) {
    el.innerText = text;
    el.dispatchEvent(makeInputEvent(text));
  }
}

// InputEvent (richer, what rich editors prefer) where available; plain Event
// otherwise (older engines / jsdom in tests).
function makeInputEvent(text) {
  try {
    if (typeof InputEvent === 'function') {
      return new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: text,
      });
    }
  } catch {
    /* fall through */
  }
  return new Event('input', { bubbles: true });
}
