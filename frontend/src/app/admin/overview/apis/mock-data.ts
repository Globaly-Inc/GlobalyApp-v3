import type { DashboardData, DashboardPreset, GrowthPoint, RecentSignup, SiteAccessSettings } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockGrowth(days: number, max: number): GrowthPoint[] {
  const points: GrowthPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const count = Math.floor(Math.random() * (max + 1));
    if (count === 0) continue; // backend omits empty days
    points.push({ day: new Date(Date.now() - i * 86_400_000).toISOString(), count });
  }
  return points;
}

const mockSiteAccess: SiteAccessSettings = { is_locked: false, access_code: "BG7CNZ" };

export const overviewMockApi = {
  getSiteAccess: async (): Promise<SiteAccessSettings> => {
    console.log("[mock] GET /admin/platform/site-access");
    await delay(200);
    return { ...mockSiteAccess };
  },
  updateSiteAccess: async (is_locked: boolean): Promise<SiteAccessSettings> => {
    console.log("[mock] PATCH /admin/platform/site-access", is_locked);
    await delay(200);
    mockSiteAccess.is_locked = is_locked;
    return { ...mockSiteAccess };
  },
  regenerateAccessCode: async (): Promise<{ access_code: string }> => {
    console.log("[mock] POST /admin/platform/site-access/regenerate-code");
    await delay(200);
    mockSiteAccess.access_code = Math.random().toString(36).slice(2, 8).toUpperCase();
    return { access_code: mockSiteAccess.access_code };
  },
  getDashboard: async (preset: DashboardPreset): Promise<DashboardData> => {
    console.log("[mock] GET /admin/analytics/dashboard", preset);
    await delay(300);
    const days = preset === "last7" ? 7 : preset === "last90" ? 90 : 30;
    return {
      preset,
      generated_at: new Date().toISOString(),
      summary: {
        total_users: 22,
        total_businesses: 176, // businesses + institutions combined
        active_businesses: 134,
        total_admins: 4,
        total_extraction_jobs: 88,
      },
      feature_usage: [
        { key: "profiles", label: "User Profiles", count: 18, last_week: 15 },
        { key: "qualifications", label: "Qualifications", count: 42, last_week: 40 },
        { key: "language_tests", label: "Language Tests", count: 12, last_week: 12 },
        { key: "work_experiences", label: "Work Experiences", count: 25, last_week: 21 },
        { key: "files", label: "Uploaded Files", count: 96, last_week: 80 },
        { key: "businesses", label: "Businesses", count: 176, last_week: 3 },
        { key: "extraction_jobs", label: "Extraction Jobs", count: 88, last_week: 70 },
        { key: "extracted_courses", label: "Extracted Courses", count: 402, last_week: 350 },
        { key: "enquiries", label: "Enquiries", count: 1, last_week: 0 },
        { key: "feed_posts", label: "Feed Posts", count: 6, last_week: 1 },
        { key: "jobs", label: "Jobs", count: 0, last_week: 0 },
        { key: "referrals", label: "Referrals", count: 3, last_week: 1 },
        { key: "countries", label: "Countries", count: 198, last_week: 0 },
        { key: "blog_posts", label: "Blog Posts", count: 9, last_week: 0 },
        { key: "scholarships", label: "Scholarships", count: 37, last_week: 2 },
        { key: "credit_transactions", label: "Credit Transactions", count: 163, last_week: 1 },
        { key: "chat_sessions", label: "Chat Sessions", count: 1, last_week: 0 },
        { key: "waitlist", label: "Waitlist Signups", count: 14, last_week: 4 },
      ],
      growth: {
        users: mockGrowth(days, 3),
        businesses: mockGrowth(days, 2),
        activity: mockGrowth(days, 12),
      },
      user_breakdown: {
        by_category: [
          { category: "personal", count: 15 },
          { category: "business", count: 5 },
          { category: "uncategorized", count: 2 },
        ],
      },
      extraction: {
        by_status: [
          { status: "done", count: 72 },
          { status: "processing", count: 8 },
          { status: "pending", count: 5 },
          { status: "failed", count: 3 },
        ],
      },
      recent_signups: [
        { id: 1, uuid: "u1", first_name: "Amara", last_name: "Diallo", email: "amara@example.com", created_at: new Date(Date.now() - 1 * 3600_000).toISOString() },
        { id: 2, uuid: "u2", first_name: "Lena", last_name: "Schmidt", email: "lena@example.com", created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
        { id: 3, uuid: "u3", first_name: "James", last_name: "Okafor", email: "james@example.com", created_at: new Date(Date.now() - 8 * 3600_000).toISOString() },
        { id: 4, uuid: "u4", first_name: null, last_name: null, email: "unknown@example.com", created_at: new Date(Date.now() - 1 * 86_400_000).toISOString() },
        { id: 5, uuid: "u5", first_name: "Sofia", last_name: "Martínez", email: "sofia@example.com", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      ] satisfies RecentSignup[],
    };
  },
};
