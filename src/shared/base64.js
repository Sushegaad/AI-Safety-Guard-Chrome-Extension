/* ============================================================================
 * AI Safety Guard — base64 helpers for transferring file bytes between contexts
 * ----------------------------------------------------------------------------
 * chrome.runtime messages are JSON-serializable only, so PDF bytes are passed
 * from the content script to the offscreen document (via the service worker) as
 * a base64 string. Chunked to avoid call-stack limits on large arrays.
 * ========================================================================== */

export function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
