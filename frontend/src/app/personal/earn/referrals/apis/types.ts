// Wire types for Earn → Referrals.

export type ReferralState = "signed_up" | "credited" | "expired" | "voided" | "rejected";

export type ReferralActionType = "student_referral" | "business_referral";

export interface ReferralRow {
  id: number;
  date: string;
  state: ReferralState;
  /** Only present once the referral has resolved to an action (student/business). */
  action_type?: ReferralActionType;
  /** Only present on `credited` rows. */
  credits_awarded?: number;
}

export interface ReferralStats {
  total_referred: number;
  total_credits: number;
  students_referred: number;
  businesses_referred: number;
}

export interface ReferralConfig {
  student_referral_reward: number;
  business_referral_reward: number;
  /** Window, in days, within which credits must land after signup. */
  w2_days: number;
}

export interface MyReferrals {
  /**
   * null is a REAL state, not an error to paper over: code issuance converges eventually, so a brand
   * new account can briefly have none. The page shows an error state with a support path and NEVER
   * creates one (V2 silently rendered a dash and then copied a broken "https://" link).
   */
  code: string | null;
  config: ReferralConfig;
  stats: ReferralStats;
  referrals: ReferralRow[];
}
