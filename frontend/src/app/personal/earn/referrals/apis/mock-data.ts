// Mock API — same method names as real-api so createApi can swap them with no call-site change.
import type { MyReferrals } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CONFIG = {
  student_referral_reward: 20,
  business_referral_reward: 100,
  w1_days: 30,
  w2_days: 90,
};

export const referralsMockApi = {
  getMyReferrals: async (): Promise<MyReferrals> => {
    console.log("[mock] referrals.getMyReferrals");
    await delay(300);
    return {
      code: "R4KD9M2XQP",
      stats: { students_referred: 2, businesses_referred: 1, pending_reward_credits: 140 },
      // Phase 1 shows credited rows only, so the mock does too — a pending row here would invite
      // someone to build the Phase 2 lifecycle UI early.
      referrals: [
        { id: 3, date: "2026-08-10T09:00:00Z", action_type: "business_referral", state: "qualified", reward_credits: 100 },
        { id: 2, date: "2026-07-28T09:00:00Z", action_type: "student_referral", state: "qualified", reward_credits: 20 },
        { id: 1, date: "2026-07-14T09:00:00Z", action_type: "student_referral", state: "qualified", reward_credits: 20 },
      ],
      config: CONFIG,
    };
  },
};
