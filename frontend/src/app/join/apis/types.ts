// Wire types for the public /join landing.

/**
 * The lookup response is an intentionally NARROW three-field contract. The endpoint is public and
 * unauthenticated — it takes a short code and returns a person's name — so it exposes a first name (or
 * a business name, which is already public) and nothing else. No ids, no email, no avatar.
 */
export interface ReferralLookup {
  referrer_type: "user" | "business";
  display_name: string;
  /** Opaque signed W1 token. The client stores and forwards it; it never parses it. */
  ref_token: string;
}
