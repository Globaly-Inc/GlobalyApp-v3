// Wire types for the PUBLIC POST /api/v3/waitlist.
// Mirrors backend/src/modules/waitlist/{consts.ts,schemas/waitlist.schema.ts}.

/**
 * The closed registrant vocabulary — V2's `registrant_type`, backed by a CHECK
 * constraint in 20260817_822_waitlist_registrations. Unlike the favourites
 * vocabulary this is genuinely closed: adding a kind is a product decision with a
 * matching change to this form.
 */
export const REGISTRANT_TYPES = ["student", "institution", "service_provider", "other"] as const;

export type RegistrantType = (typeof REGISTRANT_TYPES)[number];

export interface WaitlistSignupInput {
  email: string;
  name: string;
  type: RegistrantType;
}

/**
 * `already_registered` is the ONLY bit of state the public endpoint returns, and
 * only about the address just submitted — deliberately not a 409, so the endpoint
 * cannot be used as an oracle for "is this person on the list". A repeat submit
 * still answers ok:true, and the UI treats both the same way.
 */
export interface WaitlistSignupResult {
  ok: true;
  already_registered: boolean;
}
