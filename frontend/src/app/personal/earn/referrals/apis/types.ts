// Wire types for Earn → Referrals. Phase 1 is credit-free: reward amounts and the
// credited lifecycle return with the credits phase.

/** Phase 1 only ever returns `signed_up` rows. The other states arrive with the credits phase. */
export type ReferralState = "signed_up" | "credited" | "expired" | "voided" | "rejected";

export interface ReferralRow {
  id: number;
  date: string;
  state: ReferralState;
}

export interface ReferralStats {
  total_referred: number;
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
}
