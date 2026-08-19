// Referral program configuration.
//
// Reward amounts are deliberately ABSENT: Phase 1 records referrals but does not touch credits.
// When the credits phase ships, amounts return here and are served by one config endpoint so no
// frontend file hard-codes them (V2 embedded literals in three files and drifted).

export const REFERRAL_CONFIG = {
  /** W1 — first /join landing to registration. Enforced by the ref_token JWT expiry. */
  w1_days: 30,
} as const;

/** Who can own a referral code / be a party to a referral. */
export type OwnerType = "user" | "business";

/** Reserved for the credits phase: how a referral qualified. Nothing writes these yet. */
export type ReferralActionType = "student_referral" | "business_referral";

/** Referral lifecycle states. Phase 1 writes only signed_up; the rest are reserved. */
export type ReferralState = "signed_up" | "credited" | "expired" | "voided" | "rejected";

/** Named DB constraints this module branches on. Renaming one here without renaming it in the
 *  migration would silently turn "already attributed" into an unexpected error, so they are
 *  centralised rather than inlined as string literals. */
export const CONSTRAINTS = {
  codeOwnerUnique: "referral_codes_owner_unique",
  codeLowerUnique: "referral_codes_code_lower",
  referredUnique: "referrals_referred_unique",
} as const;

export const PG_UNIQUE_VIOLATION = "23505";
