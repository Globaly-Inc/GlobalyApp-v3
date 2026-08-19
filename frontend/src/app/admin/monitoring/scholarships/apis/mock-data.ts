import type { ImportJob, ImportRowResult, Paginated, Scholarship, ScholarshipInput } from "./types";
import type { ScholarshipListParams } from "./real-api";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextId = 3;
let nextImportJobId = 1;
const importJobs = new Map<number, { job: ImportJob; pending: ScholarshipInput[] }>();
const mockScholarships: Scholarship[] = [
  {
    id: 1, title: "Vice-Chancellor's Excellence Scholarship", slug: "vice-chancellors-excellence-scholarship",
    description: null, provider_name: "University of Melbourne", source_type: "university",
    country: "Australia", city: "Melbourne", region: null, basis: "merit",
    degree_levels: ["master"], requirements_summary: null, coverage_type: "partial_tuition",
    coverage_amount: 10000, coverage_currency: "AUD", coverage_description: null,
    deadline: "2026-10-31", deadline_notes: null, application_url: null, source_url: null,
    is_published: true, is_featured: true, view_count: 128,
    created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z",
  },
  {
    id: 2, title: "Global Leaders Award", slug: "global-leaders-award",
    description: null, provider_name: "Global Foundation", source_type: "foundation",
    country: "United Kingdom", city: null, region: null, basis: "diversity",
    degree_levels: ["bachelor", "master"], requirements_summary: null, coverage_type: "full_tuition",
    coverage_amount: null, coverage_currency: "GBP", coverage_description: null,
    deadline: "2026-11-15", deadline_notes: null, application_url: null, source_url: null,
    is_published: false, is_featured: false, view_count: 12,
    created_at: "2026-08-05T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z",
  },
];

function applyFilters(rows: Scholarship[], params: ScholarshipListParams) {
  return rows.filter((s) => {
    if (params.search) {
      const q = params.search.toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !(s.provider_name ?? "").toLowerCase().includes(q)) return false;
    }
    if (params.is_published !== undefined && s.is_published !== params.is_published) return false;
    if (params.is_featured !== undefined && s.is_featured !== params.is_featured) return false;
    if (params.country && s.country !== params.country) return false;
    if (params.coverage_min !== undefined && (s.coverage_amount ?? -Infinity) < params.coverage_min) return false;
    if (params.coverage_max !== undefined && (s.coverage_amount ?? Infinity) > params.coverage_max) return false;
    if (params.deadline_from && (!s.deadline || s.deadline < params.deadline_from)) return false;
    if (params.deadline_to && (!s.deadline || s.deadline > params.deadline_to)) return false;
    return true;
  });
}

export const scholarshipsMockApi = {
  getScholarships: async (params: ScholarshipListParams = {}): Promise<Paginated<Scholarship>> => {
    console.log("[mock] GET /admin/monitoring/scholarships", params);
    await delay(300);
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const filtered = applyFilters(mockScholarships, params);
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      meta: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) || 1 },
    };
  },
  createScholarship: async (input: ScholarshipInput): Promise<Scholarship> => {
    console.log("[mock] POST /admin/monitoring/scholarships", input);
    await delay(300);
    const now = new Date().toISOString();
    const row: Scholarship = { ...input, id: nextId++, view_count: 0, created_at: now, updated_at: now };
    mockScholarships.unshift(row);
    return row;
  },
  updateScholarship: async (id: number, input: Partial<ScholarshipInput>): Promise<Scholarship> => {
    console.log("[mock] PATCH /admin/monitoring/scholarships", id, input);
    await delay(300);
    const index = mockScholarships.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Scholarship not found");
    const updated = { ...mockScholarships[index], ...input, updated_at: new Date().toISOString() } as Scholarship;
    mockScholarships[index] = updated;
    return updated;
  },
  deleteScholarship: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /admin/monitoring/scholarships", id);
    await delay(300);
    const index = mockScholarships.findIndex((s) => s.id === id);
    if (index !== -1) mockScholarships.splice(index, 1);
  },
  startImport: async (rows: ScholarshipInput[]): Promise<ImportJob> => {
    console.log("[mock] POST /admin/monitoring/scholarships/import", rows.length);
    await delay(200);
    const job: ImportJob = {
      id: nextImportJobId++, status: "processing", total_rows: rows.length,
      processed_rows: 0, created_count: 0, error_count: 0, results: [], failure_reason: null,
    };
    importJobs.set(job.id, { job, pending: [...rows] });
    return job;
  },
  getImportJob: async (id: number): Promise<ImportJob> => {
    // Processes one row per poll so the mock UI shows the same incremental progress as the real worker.
    await delay(150);
    const entry = importJobs.get(id);
    if (!entry) throw new Error("Import job not found");
    const next = entry.pending.shift();
    if (next) {
      const now = new Date().toISOString();
      const row: Scholarship = { ...next, id: nextId++, view_count: 0, created_at: now, updated_at: now };
      mockScholarships.unshift(row);
      const result: ImportRowResult = { title: next.title, status: "ok" };
      entry.job = {
        ...entry.job,
        processed_rows: entry.job.processed_rows + 1,
        created_count: entry.job.created_count + 1,
        results: [...entry.job.results, result],
        status: entry.pending.length === 0 ? "completed" : "processing",
      };
    }
    return entry.job;
  },
  bulkDeleteScholarships: async (ids: number[]): Promise<{ queued: number }> => {
    console.log("[mock] POST /admin/monitoring/scholarships/bulk-delete", ids);
    await delay(200);
    for (const id of ids) {
      const index = mockScholarships.findIndex((s) => s.id === id);
      if (index !== -1) mockScholarships.splice(index, 1);
    }
    return { queued: ids.length };
  },
};
