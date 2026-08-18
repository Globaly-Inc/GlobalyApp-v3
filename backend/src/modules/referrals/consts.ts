// Referral program configuration — the single source of truth for reward amounts and windows.
//
// Served to every surface (Personal, Business, Admin, and the pricing page when it exists) by
// GET /api/v3/referrals/config. NO frontend file may hard-code 20 or 100: V2 embedded those literals
// in three separate files, which is exactly how its copy and its behaviour drifted apart.
//
// ponytail: a const now. Phase 4 moves these into a settings row behind the SAME endpoint, so no
// consumer changes when the admin config UI lands.

export const REFERRAL_CONFIG = {
  /** Referred individual reaches 100% profile completion. */
  student_referral_reward: 20,
  /** A business the referred user owns completes verification. */
  business_referral_reward: 100,
  /** W1 — first /join landing to registration. Enforced by the ref_token JWT expiry. */
  w1_days: 30,
  /** W2 — activation (signed_up_at) to qualification. Enforced at award time. */
  w2_days: 90,
} as const;

export type ReferralActionType = "student_referral" | "business_referral";

export const REWARD_BY_ACTION: Record<ReferralActionType, number> = {
  student_referral: REFERRAL_CONFIG.student_referral_reward,
  business_referral: REFERRAL_CONFIG.business_referral_reward,
};

/** Referral lifecycle states. Phase 1 writes only signed_up and credited; the rest are reserved. */
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
