// Safe URL validation for anything that will end up in an anchor href, an
// <img src>, an <iframe src>, or a redirect.
//
// `z.string().url()` is NOT this: the WHATWG URL constructor happily parses
// `javascript:alert(1)`, `data:text/html;base64,...` and `vbscript:...`, and the
// frontend renders stored URLs straight into hrefs. A closed allowlist of
// http/https is the only version of this check that is not a stored-XSS bug
// waiting for a renderer.
//
// Use `webUrl()` for every user-supplied URL field. Never `z.string().url()`.

import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Default cap — long enough for a real CDN URL, short enough to bound storage. */
const DEFAULT_MAX = 2000;

export function isWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol);
}

/**
 * A zod string that only accepts an absolute http(s) URL.
 * `max` bounds the stored length (defaults to 2000).
 */
export function webUrl(options: { max?: number } = {}) {
  return z
    .string()
    .trim()
    .min(1)
    .max(options.max ?? DEFAULT_MAX)
    .refine(isWebUrl, { message: "Must be an absolute http(s) URL" });
}
