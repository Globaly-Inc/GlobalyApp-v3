import type { ReferralConfig, ReferralLookup } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const joinMockApi = {
  lookup: async (code: string): Promise<ReferralLookup> => {
    console.log("[mock] join.lookup", code);
    await delay(250);
    if (code.toUpperCase() === "UNKNOWN") throw new Error("We couldn't find that invite link.");
    return { referrer_type: "user", display_name: "Amara", ref_token: `mock-token-for-${code}` };
  },
  getConfig: async (): Promise<ReferralConfig> => {
    console.log("[mock] join.getConfig");
    await delay(100);
    return { student_referral_reward: 20, business_referral_reward: 100, w1_days: 30, w2_days: 90 };
  },
};
