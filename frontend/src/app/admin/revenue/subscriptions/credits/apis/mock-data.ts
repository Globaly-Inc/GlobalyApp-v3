import type { ListCreditsParams, PaginatedCredits } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Includes referral rows, since those are the reason this screen has real data at all.
const ROWS = [
  { id: 5, created_at: "2026-08-18T04:10:00Z", owner_type: "user" as const, owner_id: 12, owner_name: "Amara Okafor", kind: "referral_reward" as const, amount: 100, balance_after: 260, description: "Referral reward", reference_type: "referral", reference_id: 8 },
  { id: 4, created_at: "2026-08-17T11:02:00Z", owner_type: "business" as const, owner_id: 3, owner_name: "Global Study Institute", kind: "purchase" as const, amount: 500, balance_after: 1240, description: "Credit pack", reference_type: null, reference_id: null },
  { id: 3, created_at: "2026-08-16T09:30:00Z", owner_type: "user" as const, owner_id: 12, owner_name: "Amara Okafor", kind: "referral_reward" as const, amount: 20, balance_after: 160, description: "Referral reward", reference_type: "referral", reference_id: 6 },
  { id: 2, created_at: "2026-08-15T15:44:00Z", owner_type: "business" as const, owner_id: 7, owner_name: "Prime Education Group", kind: "manual_adjustment" as const, amount: -50, balance_after: 310, description: "Support goodwill reversal", reference_type: null, reference_id: null },
  // owner_name null models a deleted account: financial history must still render.
  { id: 1, created_at: "2026-08-14T08:00:00Z", owner_type: "user" as const, owner_id: 99, owner_name: null, kind: "referral_reversal" as const, amount: -20, balance_after: 0, description: "Referral reversed", reference_type: "referral", reference_id: 2 },
];

export const creditLedgerMockApi = {
  listCredits: async (params: ListCreditsParams = {}): Promise<PaginatedCredits> => {
    console.log("[mock] creditLedger.listCredits", params);
    await delay(300);
    const filtered = params.kind ? ROWS.filter((r) => r.kind === params.kind) : ROWS;
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    return {
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
    };
  },
};
