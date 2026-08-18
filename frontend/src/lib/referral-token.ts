// Referral capture — the client half of W1 attribution.
//
// Mirrors session.ts in shape (window guards, get/set/clear) and in key prefix. The value is an opaque
// signed JWT minted by GET /referrals/lookup/:code; the client never parses it. It carries the
// immutable referral_codes.id, and its `exp` IS the W1 window, so the server needs nothing else.

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
 * NEXT_PUBLIC_APP_URL must be set PER ENVIRONMENT. A referral link is a durable artefact — someone
 * copies it once and shares it for months — so a staging deploy that falls back to the production host
 * would mint production links from staging. The warning below makes that visible instead of silent.
 * NEXT_PUBLIC_* is inlined at build time, so this is a per-target build variable.
 */
export function buildReferralLink(code: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV !== "production") {
    console.warn(
      "[referrals] NEXT_PUBLIC_APP_URL is not set — falling back to siteConfig.url. Referral links " +
        "generated here may point at the wrong environment.",
    );
  }
  const host = (configured ?? "https://www.globalyapp.com").replace(/\/+$/, "");
  return `${host}/join?ref=${encodeURIComponent(code)}`;
}
