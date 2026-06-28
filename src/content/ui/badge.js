/* ============================================================================
 * AI Safety Guard — Screen A1: Inline Risk Badge
 * ----------------------------------------------------------------------------
 * A quiet indicator anchored just outside the AI input box. Lives in its own
 * shadow root (style isolation). Updates as you type.
 *
 *   Line 1: "<Risk label>"  (Critical also shows "· N findings")
 *   Line 2: "scanned locally · Nms"   ← reinforces local-first on every scan
 *
 * Hidden when input is empty, or when the sensitivity mode says so
 * (shouldShowBadge): Strict shows it always; others hide it when Safe.
 * ========================================================================== */

import { createShadowHost } from './shadow-style.js';
import { RISK, shouldShowBadge } from '../../shared/constants.js';
import { h, riskClass } from './h.js';

export function createBadge(anchorEl, doc = document) {
  const { host, root } = createShadowHost(doc, 'asg-badge-host');
  host.style.position = 'relative';
  host.style.display = 'inline-block';

  // Insert the host right after the anchor (just outside the input area).
  if (anchorEl && anchorEl.parentNode) {
    anchorEl.parentNode.insertBefore(host, anchorEl.nextSibling);
  } else {
    doc.body.appendChild(host);
  }

  const dot = h('span.asg-dot');
  const labelText = doc.createTextNode('');
  const label = h('span.asg-badge__label', {}, [dot, labelText]);
  const meta = h('span.asg-badge__meta');
  const badge = h('div.asg-badge', {}, [label, meta]);
  root.appendChild(badge);
  host.style.display = 'none';

  function update(result, sensitivity) {
    const level = result.riskLevel || 'safe';
    const visible = result.matches.length >= 0 && shouldShowBadge(level, sensitivity);
    if (!visible) {
      host.style.display = 'none';
      return;
    }
    host.style.display = 'inline-block';
    dot.className = 'asg-dot asg-dot--' + riskClass(level);

    let labelStr = RISK[level].badgeLabel;
    if (level === 'critical') {
      const n = result.matches.filter((m) => m.showInModal).length || result.matches.length;
      labelStr += ` · ${n} finding${n === 1 ? '' : 's'}`;
    }
    labelText.nodeValue = labelStr;
    meta.textContent = `scanned locally · ${result.scanMs}ms`;
  }

  function hide() {
    host.style.display = 'none';
  }

  function destroy() {
    host.remove();
  }

  return { update, hide, destroy, host };
}
