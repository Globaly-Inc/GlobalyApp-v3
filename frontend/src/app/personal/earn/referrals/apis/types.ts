// Wire types for Earn → Referrals.

/** Reward amounts and windows — served by the backend so no surface hard-codes 20 or 100. */
export interface ReferralConfig {
  student_referral_reward: number;
  business_referral_reward: number;
  w1_days: number;
  w2_days: number;
}

export type ReferralActionType = "student_referral" | "business_referral";

/** Phase 1 only ever returns `credited` rows. The other states arrive with the Phase 2 lifecycle. */
export type ReferralState = "signed_up" | "credited" | "expired" | "voided" | "rejected";

export interface ReferralRow {
  id: number;
  date: string;
  action_type: ReferralActionType | null;
  state: ReferralState;
  credits_awarded: number | null;
}

export interface ReferralStats {
  total_credits: number;
  students_referred: number;
  businesses_referred: number;
}

export interface MyReferrals {
  /**
   * null is a REAL state, not an error to paper over: code issuance converges eventually, so a brand
   * new account can briefly have none. The page shows an error state with a support path and NEVER
   * creates one (V2 silently rendered a dash and then copied a broken "https://" link).
   */
  code: string | null;
  stats: ReferralStats;
  referrals: ReferralRow[];
  config: ReferralConfig;
}
