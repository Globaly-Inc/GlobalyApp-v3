import type {
  PromoteResult,
  VerticalRow,
  VerticalRowsResponse,
  VerticalReviewStatus,
  VerticalSlug,
  VerticalSummary,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LABELS: Record<VerticalSlug, string> = {
  accommodation: "Accommodation",
  insurance: "Insurance",
  banking: "Banking & Finance",
  visa_services: "Visa Services",
  test_preparation: "Test Preparation",
  career_services: "Career Services",
  translation: "Translation",
  transport: "Transport",
};

let mockRows: Record<string, VerticalRow[]> = {
  accommodation: [
    {
      id: "acc-1",
      job_id: "job-1",
      status: "pending",
      promoted_service_id: null,
      name: "Sunnyside Student Living",
      provider_name: "Sunnyside Group",
      description: "Purpose-built student accommodation, 8 minutes from campus.",
      country_code: "AU",
      website: "https://sunnyside.example/live",
      source_url: "https://sunnyside.example/live",
      confidence_score: 0.91,
      created_at: "2026-08-14T09:00:00Z",
      updated_at: "2026-08-14T09:00:00Z",
      type: "student_housing",
      price_amount: 320.5,
      price_currency: "AUD",
      price_period: "per_week",
    },
    {
      id: "acc-2",
      job_id: "job-1",
      status: "promoted",
      promoted_service_id: "11111111-1111-1111-1111-111111111111",
      name: "Riverbank Homestay Network",
      provider_name: "Riverbank",
      description: "Homestay placements with vetted host families.",
      country_code: "AU",
      website: "https://riverbank.example",
      source_url: "https://riverbank.example/homestay",
      confidence_score: 0.74,
      created_at: "2026-08-13T09:00:00Z",
      updated_at: "2026-08-13T09:00:00Z",
      type: "homestay",
      price_amount: 380,
      price_currency: "AUD",
      price_period: "per_week",
    },
  ],
  test_preparation: [
    {
      id: "tp-1",
      job_id: "job-2",
      status: "pending",
      promoted_service_id: null,
      name: "IELTS Intensive — 6 weeks",
      provider_name: "Southbank English",
      description: "Six-week intensive with weekly mock tests.",
      country_code: "AU",
      website: "https://southbank.example",
      source_url: "https://southbank.example/ielts",
      confidence_score: 0.83,
      created_at: "2026-08-12T09:00:00Z",
      updated_at: "2026-08-12T09:00:00Z",
      test_type: "IELTS",
      fee_amount: 890,
      fee_currency: "AUD",
      fee_period: "per_course",
    },
  ],
};

export const serviceVerticalsMockApi = {
  listVerticals: async (): Promise<VerticalSummary[]> => {
    console.log("[mock] GET /admin/data-extraction/service-verticals");
    await delay(250);
    return (Object.keys(LABELS) as VerticalSlug[]).map((slug) => {
      const rows = mockRows[slug] ?? [];
      return {
        slug,
        label: LABELS[slug],
        counts: {
          pending: rows.filter((r) => r.status === "pending").length,
          promoted: rows.filter((r) => r.status === "promoted").length,
          discarded: rows.filter((r) => r.status === "discarded").length,
          total: rows.length,
        },
      };
    });
  },

  listRows: async (slug: VerticalSlug, status?: VerticalReviewStatus): Promise<VerticalRowsResponse> => {
    console.log(`[mock] GET /admin/data-extraction/service-verticals/${slug}?status=${status ?? "all"}`);
    await delay(250);
    const rows = mockRows[slug] ?? [];
    return {
      vertical: {
        slug,
        label: LABELS[slug],
        type_column: slug === "test_preparation" ? "test_type" : "type",
      },
      rows: status ? rows.filter((r) => r.status === status) : rows,
    };
  },

  discardRow: async (slug: VerticalSlug, id: string): Promise<void> => {
    console.log(`[mock] POST /admin/data-extraction/service-verticals/${slug}/${id}/discard`);
    await delay(200);
    mockRows = {
      ...mockRows,
      [slug]: (mockRows[slug] ?? []).map((r) =>
        r.id === id ? { ...r, status: "discarded" as const } : r,
      ),
    };
  },

  promoteRow: async (slug: VerticalSlug, id: string, targetOrgId: number): Promise<PromoteResult> => {
    console.log(`[mock] POST /admin/data-extraction/service-verticals/${slug}/${id}/promote`);
    await delay(200);
    mockRows = {
      ...mockRows,
      [slug]: (mockRows[slug] ?? []).map((r) =>
        r.id === id ? { ...r, status: "promoted" as const } : r,
      ),
    };
    return {
      service_id: "22222222-2222-2222-2222-222222222222",
      org_type: "institution",
      org_id: targetOrgId,
      schema_name: "33333333-3333-3333-3333-333333333333",
    };
  },
};
