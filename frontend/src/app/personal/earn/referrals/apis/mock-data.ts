// Mock API — same method names as real-api so createApi can swap them with no call-site change.
import type { MyReferrals } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const referralsMockApi = {
  getMyReferrals: async (): Promise<MyReferrals> => {
    console.log("[mock] referrals.getMyReferrals");
    await delay(300);
    return {
      code: "R4KD9M2XQP",
      stats: { total_referred: 3 },
      referrals: [
        { id: 3, date: "2026-08-10T09:00:00Z", state: "signed_up" },
        { id: 2, date: "2026-07-28T09:00:00Z", state: "signed_up" },
        { id: 1, date: "2026-07-14T09:00:00Z", state: "signed_up" },
      ],
    };
  },
};
