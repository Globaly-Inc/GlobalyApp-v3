// Web-linkable URL validation.
//
// z.string().url() is NOT this. It delegates to the URL constructor, which accepts
// ANY scheme — javascript:, data:, vbscript: and file: all parse as valid URLs and
// all pass. Every one of these columns is rendered straight into an anchor href by
// the frontend (course-card.tsx, visas-view.tsx, course-detail-panel.tsx and others
// do `href={row.source_url}`), so a javascript: value stored through the admin API
// is stored XSS that fires on click. rel="noopener noreferrer" does not help: it
// governs the new browsing context, not whether the scheme executes.
//
// The scheme allowlist is closed on purpose. Anything not http/https is rejected
// rather than sanitised, because a link the user cannot click is a visible bug
// while a link that runs script is an invisible one.

import { z } from "zod";

/** Schemes a stored URL may use. Closed set — see the file header. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false; // relative or malformed — never a link we hand to a browser
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}

/**
 * Drop-in replacement for `z.string().url()` for any value that reaches an href.
 * Use this everywhere instead; `.url()` alone is a stored-XSS vector.
 */
export function webUrl(opts: { max?: number } = {}) {
  // .max() has to be applied before .refine(), because refine returns a
  // ZodEffects and ZodString's chainable methods are gone after it.
  const base = opts.max === undefined ? z.string().trim() : z.string().trim().max(opts.max);
  return base.refine(isWebUrl, { message: "Must be an http(s) URL" });
}
