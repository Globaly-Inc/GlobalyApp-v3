import type { ReferralLookup } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const joinMockApi = {
  lookup: async (code: string): Promise<ReferralLookup> => {
    console.log("[mock] join.lookup", code);
    await delay(250);
    if (code.toUpperCase() === "UNKNOWN") throw new Error("We couldn't find that invite link.");
    return { referrer_type: "user", display_name: "Amara", ref_token: `mock-token-for-${code}` };
  },
};
