// Mock API — same method names as real-api so createApi can swap them with no call-site change.
import type { MyReferrals } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const referralsMockApi = {
  getMyReferrals: async (): Promise<MyReferrals> => {
    console.log("[mock] referrals.getMyReferrals");
    await delay(300);
    return {
      code: "R4KD9M2XQP",
      config: { student_referral_reward: 20, business_referral_reward: 100, w2_days: 14 },
      stats: { total_referred: 3, total_credits: 120, students_referred: 2, businesses_referred: 1 },
      referrals: [
        { id: 3, date: "2026-08-10T09:00:00Z", state: "signed_up" },
        {
          id: 2,
          date: "2026-07-28T09:00:00Z",
          state: "credited",
          action_type: "business_referral",
          credits_awarded: 100,
        },
        {
          id: 1,
          date: "2026-07-14T09:00:00Z",
          state: "credited",
          action_type: "student_referral",
          credits_awarded: 20,
        },
      ],
    };
  },
};
