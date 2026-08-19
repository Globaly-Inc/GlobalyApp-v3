// Referral capture — the client half of W1 attribution.
//
// Mirrors session.ts in shape (window guards, get/set/clear) and in key prefix. The value is an opaque
// signed JWT minted by GET /referrals/lookup/:code; the client never parses it. It carries the
// immutable referral_codes.id, and its `exp` IS the W1 window, so the server needs nothing else.

import { siteConfig } from "@/config/site";

const REF_TOKEN_KEY = "globaly_ref_token";

export function getRefToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REF_TOKEN_KEY);
}

/**
 * FIRST-TOUCH: store only if absent.
 *
 * This is a product rule, not a storage detail. A visitor who opens Alice's link and then Bob's, in the
 * same browser, is Alice's referral. Last-touch would let any referrer overwrite an in-flight referral
 * just by getting a newer link in front of the invitee — so the referrer who did the persuading loses
 * the reward to whoever messaged most recently. Refusing to overwrite is therefore an anti-abuse
 * control, not a tie-break.
 *
 * Returns true when this call is the one that captured.
 *
 * NOTE the honest limit: this is per-browser. Alice's link on a laptop and Bob's on a phone, registering
 * on the phone, credits BOB — nothing is stored server-side before registration, so the server cannot
 * know Alice's click happened. Closing that would need server-side click tracking (Phase 4).
 */
export function captureRefTokenIfAbsent(token: string): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(REF_TOKEN_KEY)) return false;
  localStorage.setItem(REF_TOKEN_KEY, token);
  return true;
}

/** Called once sign-up has actually produced an account. */
export function clearRefToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REF_TOKEN_KEY);
}

/**
 * The absolute referral link. ONE builder, so the host cannot drift between surfaces — V2 duplicated
 * `globaly.app/join?ref=` across two files and prepended "https://" only at copy time, which is how it
 * ended up pointing at a domain the app was never served from.
 *
 * The host comes from the live origin rather than configuration: this only ever runs in a browser that
 * is already on the app, so localhost, staging and production each produce their own correct link with
 * nothing to set and nothing that can be misconfigured per environment.
 *
 * siteConfig.url covers the server-render path only, where `window` does not exist. A link is never
 * rendered there in practice — the code arrives from a client-side fetch — so it is a safety net, not a
 * fallback anyone should rely on.
 */
export function buildReferralLink(code: string): string {
  const host = typeof window === "undefined" ? siteConfig.url : window.location.origin;
  return `${host.replace(/\/+$/, "")}/join?ref=${encodeURIComponent(code)}`;
}
