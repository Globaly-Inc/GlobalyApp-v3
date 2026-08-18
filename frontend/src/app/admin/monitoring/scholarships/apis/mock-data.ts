import type { Scholarship } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockScholarships: Scholarship[] = [
  {
    id: 1, title: "Vice-Chancellor's Excellence Scholarship", slug: "vice-chancellors-excellence-scholarship",
    description: null, provider_name: "University of Melbourne", source_type: "university",
    country: "Australia", city: "Melbourne", region: null, basis: "merit",
    degree_levels: ["Masters"], requirements_summary: null, coverage_type: "partial_tuition",
    coverage_amount: 10000, coverage_currency: "AUD", coverage_description: null,
    deadline: "2026-10-31", deadline_notes: null, application_url: null, source_url: null,
    is_published: true, is_featured: true, view_count: 128,
    created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
  },
  {
    id: 2, title: "Global Leaders Award", slug: "global-leaders-award",
    description: null, provider_name: "Global Foundation", source_type: "foundation",
    country: "United Kingdom", city: null, region: null, basis: "diversity",
    degree_levels: ["Bachelors", "Masters"], requirements_summary: null, coverage_type: "full_tuition",
    coverage_amount: null, coverage_currency: "GBP", coverage_description: null,
    deadline: "2026-11-15", deadline_notes: null, application_url: null, source_url: null,
    is_published: false, is_featured: false, view_count: 12,
    created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z",
  },
];

export const scholarshipsMockApi = {
  getScholarships: async (): Promise<Scholarship[]> => {
    console.log("[mock] GET /admin/monitoring/scholarships");
    await delay(300);
    return mockScholarships;
  },
};
