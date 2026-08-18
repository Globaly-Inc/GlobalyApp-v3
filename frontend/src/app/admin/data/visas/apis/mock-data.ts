import type { VisaExtraction, VisaExtractionStatus } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockVisas: VisaExtraction[] = [
  {
    id: "v1",
    subclass_code: "500",
    name: "Student Visa",
    country_code: "AU",
    category: "Study",
    visa_stream: "Higher Education",
    confidence_score: 0.95,
    status: "pending",
    source_url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    duration_months: 60,
    is_permanent: false,
    application_fee_amount: 710,
    application_fee_currency: "AUD",
    processing_time_min_days: 14,
    processing_time_max_days: 60,
    description: "Allows international students to study full-time at an Australian educational institution.",
    created_at: "2026-08-10T09:00:00Z",
  },
  {
    id: "v2",
    subclass_code: "189",
    name: "Skilled Independent Visa",
    country_code: "AU",
    category: "Skilled",
    visa_stream: "Points-tested",
    confidence_score: 0.88,
    status: "pending",
    source_url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skilled-independent-189",
    duration_months: null,
    is_permanent: true,
    application_fee_amount: 4640,
    application_fee_currency: "AUD",
    processing_time_min_days: 60,
    processing_time_max_days: 270,
    description: "For skilled workers not sponsored by an employer, state/territory or family member.",
    created_at: "2026-08-09T08:00:00Z",
  },
  {
    id: "v3",
    subclass_code: "482",
    name: "Temporary Skill Shortage Visa",
    country_code: "AU",
    category: "Work",
    visa_stream: "Short-term",
    confidence_score: 0.72,
    status: "promoted",
    source_url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-skill-shortage-482",
    duration_months: 24,
    is_permanent: false,
    application_fee_amount: 1455,
    application_fee_currency: "AUD",
    processing_time_min_days: 30,
    processing_time_max_days: 120,
    description: "Allows employers to address labour shortages by bringing in skilled workers.",
    created_at: "2026-08-08T07:00:00Z",
  },
  {
    id: "v4",
    subclass_code: "600",
    name: "Visitor Visa",
    country_code: "AU",
    category: "Visitor",
    visa_stream: "Tourist",
    confidence_score: 0.65,
    status: "discarded",
    source_url: null,
    duration_months: 12,
    is_permanent: false,
    application_fee_amount: 190,
    application_fee_currency: "AUD",
    processing_time_min_days: 7,
    processing_time_max_days: 30,
    description: "For people visiting Australia for tourism or business.",
    created_at: "2026-08-07T06:00:00Z",
  },
];

export const visasMockApi = {
  listVisas: async (status?: VisaExtractionStatus): Promise<VisaExtraction[]> => {
    console.log("[mock] GET /admin/data-extraction/visas?status=" + (status ?? "all"));
    await delay(300);
    if (!status || (status as string) === "all") return mockVisas;
    return mockVisas.filter((v) => v.status === status);
  },

  discardVisa: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/visas/" + id + "/discard");
    await delay(200);
    mockVisas = mockVisas.map((v) => (v.id === id ? { ...v, status: "discarded" as const } : v));
  },

  promoteVisa: async (id: string, _departmentOrgId: number): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/visas/" + id + "/promote");
    await delay(200);
    mockVisas = mockVisas.map((v) => (v.id === id ? { ...v, status: "promoted" as const } : v));
  },

  launchExtraction: async (urls: string[]): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/visas/extract", urls);
    await delay(200);
    throw new Error("Extraction service unavailable (503 stub)");
  },
};
