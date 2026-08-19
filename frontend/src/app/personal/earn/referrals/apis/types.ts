// Wire types for Earn → Referrals.

/** Reward amounts and windows — served by the backend so no surface hard-codes 20 or 100. */
export interface ReferralConfig {
  student_referral_reward: number;
  business_referral_reward: number;
  w1_days: number;
  w2_days: number;
}

export type ReferralActionType = "student_referral" | "business_referral";

/** Only terminal rows are returned: `qualified` now, plus `credited` for pre-decoupling rows. */
export type ReferralState = "signed_up" | "qualified" | "credited" | "expired" | "voided" | "rejected";

export interface ReferralRow {
  id: number;
  date: string;
  action_type: ReferralActionType | null;
  state: ReferralState;
  /** What this referral earned. Credits are a separate feature, so it is owed, not yet paid. */
  reward_credits: number | null;
}

export interface ReferralStats {
  students_referred: number;
  businesses_referred: number;
  /** Derived from the qualified referrals and the configured amounts — pending, not a wallet balance. */
  pending_reward_credits: number;
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
