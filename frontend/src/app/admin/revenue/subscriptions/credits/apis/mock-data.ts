import type { LedgerEntry, LedgerPage, UserSearchResult, AdjustInput } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_ENTRIES: LedgerEntry[] = [
  {
    id: 1,
    created_at: "2026-08-30T14:35:00Z",
    amount: 100,
    balance_type: "free",
    reason: "admin_grant",
    description: "test",
    platform_user_id: 1,
    owner_name: "Wonjala Joshi",
    owner_email: "wonjala@example.com",
    balance_after: 100,
  },
  {
    id: 2,
    created_at: "2026-08-24T12:06:00Z",
    amount: 800,
    balance_type: "subscription",
    reason: "subscription_grant",
    description: "Pro trial credit grant",
    platform_user_id: 2,
    owner_name: "Concordia University of Edmonton",
    owner_email: "concordia@example.com",
    balance_after: 800,
  },
  {
    id: 3,
    created_at: "2026-07-16T14:54:00Z",
    amount: -1,
    balance_type: "free",
    reason: "message",
    description: "AI Counsellor session",
    platform_user_id: 3,
    owner_name: "Amit Ranjitkar",
    owner_email: "amit@example.com",
    balance_after: 51,
  },
  {
    id: 4,
    created_at: "2026-07-01T16:47:00Z",
    amount: 10,
    balance_type: "free",
    reason: "signup_grant",
    description: "Welcome bonus — 10 free credits",
    platform_user_id: 4,
    owner_name: "Test institution",
    owner_email: "test@institution.com",
    balance_after: 10,
  },
  {
    id: 5,
    created_at: "2026-07-01T15:38:00Z",
    amount: -1,
    balance_type: "free",
    reason: "message",
    description: "AI Counsellor session",
    platform_user_id: 5,
    owner_name: "Priansu Koirala",
    owner_email: "priansu@example.com",
    balance_after: 107,
  },
];

export const creditsLedgerMockApi = {
  getLedger: async (params: { page?: number; limit?: number; reason?: string; search?: string }): Promise<LedgerPage> => {
    console.log("[mock] GET /admin/revenue/credits/ledger", params);
    await delay(300);
    let data = [...MOCK_ENTRIES];
    if (params.reason) data = data.filter((e) => e.reason === params.reason);
    if (params.search) data = data.filter((e) => e.description?.toLowerCase().includes(params.search!.toLowerCase()));
    return { data, total: data.length, page: params.page ?? 1, limit: params.limit ?? 25 };
  },

  searchUsers: async (q: string, role: "platform" | "admin"): Promise<UserSearchResult[]> => {
    console.log("[mock] GET /admin/revenue/credits/users/search", { q, role });
    await delay(150);
    const platformUsers: UserSearchResult[] = [
      { id: 3, first_name: "Amit", last_name: "Ranjitkar", email: "amit@example.com" },
      { id: 4, first_name: "Test", last_name: "Institution", email: "test@institution.com" },
    ];
    const adminUsers: UserSearchResult[] = [
      { id: 1, first_name: "Wonjala", last_name: "Joshi", email: "wonjala@example.com" },
      { id: 5, first_name: "Priansu", last_name: "Koirala", email: "priansu@example.com" },
    ];
    const pool = role === "admin" ? adminUsers : platformUsers;
    if (!q.trim()) return pool;
    const lower = q.toLowerCase();
    return pool.filter(
      (u) =>
        u.first_name.toLowerCase().includes(lower) ||
        u.last_name.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower),
    );
  },

  adjust: async (input: AdjustInput): Promise<{ ok: boolean }> => {
    console.log("[mock] POST /admin/revenue/credits/adjust", input);
    await delay(400);
    const entry: LedgerEntry = {
      id: Date.now(),
      created_at: new Date().toISOString(),
      amount: input.amount,
      balance_type: input.balance_type,
      reason: "admin_grant",
      description: input.description,
      platform_user_id: input.user_id,
      owner_name: "Mock User",
      owner_email: "mock@example.com",
      balance_after: input.amount,
    };
    MOCK_ENTRIES.unshift(entry);
    return { ok: true };
  },
};
