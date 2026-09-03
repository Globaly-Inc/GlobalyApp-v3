import type { LedgerEntry, LedgerPage, UserSearchResult, AdjustInput, DailyLogPage, ChartResponse, ChartMetric } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_ENTRIES: LedgerEntry[] = [
  {
    // A business paying to see a lead's contact details — the only spend that is not an AI
    // message, and the one whose description carries the distribution it paid for.
    id: 0,
    created_at: "2026-08-31T11:18:00Z",
    amount: -30,
    balance_type: "free",
    reason: "enquiry_unlock",
    description: "Enquiry unlock — Cornell University · distribution 0fd19f21-da01-4a68-be7f-7112709e459c",
    platform_user_id: 1,
    owner_name: "Cornell University",
    owner_email: "admissions@cornell.example.com",
    balance_after: 480,
  },
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

  getDailyLog: async (params: { date?: string; page?: number; limit?: number; search?: string }): Promise<DailyLogPage> => {
    console.log("[mock] GET /admin/revenue/credits/daily", params);
    await delay(300);
    const date = params.date ?? new Date().toISOString().slice(0, 10);
    return {
      data: [
        {
          platform_user_id: 3,
          owner_name: "Amit Ranjitkar",
          owner_email: "amit@example.com",
          country_name: "Nepal",
          total_granted: 0,
          total_used: 5,
          net_change: -5,
          transaction_count: 5,
          closing_balance: 46,
        },
        {
          platform_user_id: 5,
          owner_name: "Priansu Koirala",
          owner_email: "priansu@example.com",
          country_name: "Australia",
          total_granted: 100,
          total_used: 3,
          net_change: 97,
          transaction_count: 4,
          closing_balance: 204,
        },
      ],
      total: 2,
      page: params.page ?? 1,
      limit: params.limit ?? 25,
      date,
    };
  },

  getChart: async (params: { metric?: ChartMetric; days?: number }): Promise<ChartResponse> => {
    console.log("[mock] GET /admin/revenue/credits/chart", params);
    await delay(400);
    const metric = params.metric ?? "total";
    const days = params.days ?? 30;
    const now = new Date();
    const buildSeries = (key: string, label: string, seed: number) => ({
      key,
      label,
      data: Array.from({ length: days }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (days - 1 - i));
        return { date: d.toISOString().slice(0, 10), value: Math.max(0, Math.round(seed * (0.5 + Math.random()))) };
      }),
    });
    const seriesMap: Record<ChartMetric, ChartResponse["series"]> = {
      total: [buildSeries("total", "Total Usage", 40)],
      by_reason: [
        buildSeries("message", "AI Tool Usage", 30),
        buildSeries("admin_grant", "Manual Adjustment", 8),
        buildSeries("signup_grant", "Signup Grant", 5),
      ],
      by_balance_type: [
        buildSeries("free", "Free Credits", 25),
        buildSeries("subscription", "Subscription Credits", 15),
        buildSeries("purchased", "Purchased Credits", 5),
      ],
      by_user: [
        buildSeries("Amit Ranjitkar", "Amit Ranjitkar", 18),
        buildSeries("Priansu Koirala", "Priansu Koirala", 12),
        buildSeries("Test Institution", "Test Institution", 7),
      ],
      by_region: [
        buildSeries("Australia", "Australia", 20),
        buildSeries("Nepal", "Nepal", 14),
        buildSeries("India", "India", 9),
      ],
    };
    return { metric, days, series: seriesMap[metric] };
  },
};
