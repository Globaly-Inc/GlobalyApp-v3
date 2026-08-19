// The render-side half of backend/src/shared/url.ts's `isWebUrl()`.
//
// React does NOT sanitize `href` or `src`. A stored `javascript:alert(1)` renders as a
// live anchor and executes on click. The backend's `webUrl()` guards *write* paths, but
// two classes of data in these columns never passed through it: the rows migrated from
// V1 (byte-faithful by design, deliberately unvalidated) and scraped extraction data.
// So every DB-sourced URL has to be checked again at the sink, here.
//
// Closed allowlist, not a `javascript:` blocklist — `data:`, `vbscript:`, `blob:` and
// anything else a future renderer honours must fail too.

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * The URL if it is an absolute http(s) URL, otherwise null.
 * Callers render a plain non-link (or nothing) on null — never the raw value.
 */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Relative paths and bare storage keys land here. They are not renderable as an
    // absolute link either, so null is the right answer for both.
    return null;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
}
