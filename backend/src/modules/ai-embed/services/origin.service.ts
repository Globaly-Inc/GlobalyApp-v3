// The AI-embed widget's authorization boundary.
//
// WHAT THIS IS AND IS NOT
// The embed key is the credential; this allowlist is the *binding* that says which
// pages that credential works from. It is enforced server-side, on every widget
// request, before any provider call — because CORS is not authorization: a browser
// honours Access-Control-Allow-Origin, and curl does not. A non-browser client can
// also forge the Origin header outright, so this check does not make a leaked key
// safe. What it does is stop the realistic attack: someone reads the embed key out
// of a partner's page source (it is public by construction — see lib/widget-script.ts)
// and drops the widget on their own site to spend the partner's credit budget from
// a real browser. That browser sets Origin honestly, and this refuses it.
//
// V1 had none of this. supabase/functions/ai-embed-validate answered
// `Access-Control-Allow-Origin: *` and looked the key up with no notion of the
// caller's origin, and public.ai_embed_configs had no allowlist column to check
// against. The allowlist and this module are a V3 addition (§1.6 security
// non-negotiables), not a port.
//
// THE RULES, all deliberate:
//   - Exact match on scheme + host + port, after normalizing both sides through
//     URL(). Never a substring, prefix or suffix test — `endsWith(".example.com")`
//     is how `partner.example.com.evil.test` gets in.
//   - http/https only, via the same closed protocol allowlist as shared/url.ts.
//   - Missing, empty or "null" Origin refuses. A sandboxed iframe and a file://
//     page both send "null"; neither is an origin anyone can be authorized as.
//   - An empty allowlist refuses everything. DENY is the default, so a config
//     created without thinking about origins is unusable rather than open.
//   - No wildcards. `*` and `https://*.example.com` are just unparseable entries
//     and are skipped, which means a config cannot opt back into V1's `*`.

import { ForbiddenError } from "../../../shared/errors.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Reduce a URL or origin string to its canonical `scheme://host[:port]` form, or
 * null when it is not an http(s) origin at all.
 *
 * `URL#origin` already lowercases the host and drops the default port, and returns
 * the literal string "null" for opaque origins — which is exactly the value a
 * sandboxed iframe sends, so it is rejected here rather than stored or matched.
 */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  // Credentials in the authority (`https://ok.test@evil.test`) mean the origin is
  // not the host a reader expects; refuse rather than guess which half wins.
  if (parsed.username || parsed.password) return null;

  const origin = parsed.origin;
  if (!origin || origin === "null") return null;
  return origin;
}

/**
 * True only when `origin` is an http(s) origin that exactly matches a normalizable
 * entry of `allowed`. Every other input — missing, malformed, wildcard, empty list
 * — is false.
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowed: readonly string[] | null | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return false;

  const candidate = normalizeOrigin(origin);
  if (!candidate) return false;

  for (const entry of allowed) {
    if (normalizeOrigin(entry) === candidate) return true;
  }
  return false;
}

/**
 * Guard form: returns the normalized origin, or throws 403.
 *
 * Routes call this, so "refuse" is the only failure mode available to them —
 * there is no variant that logs a warning and continues.
 */
export function assertOriginAllowed(
  origin: string | undefined | null,
  allowed: readonly string[] | null | undefined,
): string {
  if (!isOriginAllowed(origin, allowed)) {
    // The message never says which origins ARE allowed: the caller has already
    // failed to prove it may know.
    throw new ForbiddenError("This origin is not allowed to use this embed key");
  }
  return normalizeOrigin(origin) as string;
}
