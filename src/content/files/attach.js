/* ============================================================================
 * AI Safety Guard — Attachment watcher
 * ----------------------------------------------------------------------------
 * Detects when a file is being attached to the page, two ways:
 *   - a file <input> firing 'change' (capture phase)
 *   - a drag-and-drop 'drop' carrying files (capture phase)
 * Calls onAttach(files[]) so the orchestrator can show the Tier 0 nudge and run
 * the Tier 1 on-device content scan. Detection only; no parsing here.
 * ========================================================================== */

export function initAttachWatcher(onAttach, isEnabled, doc = document) {
  const fire = (fileList) => {
    if (!isEnabled || !isEnabled()) return;
    const files = fileList ? Array.from(fileList) : [];
    if (files.length) onAttach(files);
  };

  doc.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type="file"]') && t.files) fire(t.files);
    },
    true
  );

  doc.addEventListener(
    'drop',
    (e) => {
      if (e.dataTransfer && e.dataTransfer.files) fire(e.dataTransfer.files);
    },
    true
  );
}
