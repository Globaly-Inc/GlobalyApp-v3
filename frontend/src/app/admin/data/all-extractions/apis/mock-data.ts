import type { CreateJobParams, ExtractionJob, JobFull } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockJobs: ExtractionJob[] = [
  { id: "1", institution_name: "Concordia University of Edmonton", institution_url: "https://concordia.ab.ca/", status: "done", total_pages_found: 40, courses_extracted: 33, verification_score: 30, verification_total: 33, pages_scraped: 40, pages_failed: 0, agent_count: 2, created_at: "2026-06-30T09:00:00Z", updated_at: "2026-06-30T09:00:00Z" },
  { id: "2", institution_name: "Crandall University", institution_url: "https://www.crandallu.ca/", status: "done", total_pages_found: 25, courses_extracted: 20, verification_score: 19, verification_total: 20, pages_scraped: 25, pages_failed: 0, agent_count: 1, created_at: "2026-06-30T08:00:00Z", updated_at: "2026-06-30T08:00:00Z" },
  { id: "3", institution_name: "Aboard Training Australia", institution_url: "https://ataustralia.edu.au/", status: "done", total_pages_found: 12, courses_extracted: 10, verification_score: 10, verification_total: 10, pages_scraped: 12, pages_failed: 0, agent_count: 3, created_at: "2026-06-30T07:00:00Z", updated_at: "2026-06-30T07:00:00Z" },
  { id: "4", institution_name: "Hillshire International College", institution_url: "https://hillshire.edu.au/", status: "done", total_pages_found: 15, courses_extracted: 12, verification_score: 12, verification_total: 12, pages_scraped: 15, pages_failed: 0, agent_count: 1, created_at: "2026-06-29T10:00:00Z", updated_at: "2026-06-29T10:00:00Z" },
  { id: "5", institution_name: "University of Technology Sydney (UTS)", institution_url: "https://www.uts.edu.au", status: "completed", total_pages_found: 0, courses_extracted: 0, verification_score: 0, verification_total: 0, pages_scraped: 0, pages_failed: 0, agent_count: 0, created_at: "2026-06-28T09:00:00Z", updated_at: "2026-06-28T09:00:00Z" },
  { id: "6", institution_name: "Apsley College", institution_url: "https://apsley.nsw.edu.au/", status: "done", total_pages_found: 12, courses_extracted: 10, verification_score: 9, verification_total: 10, pages_scraped: 12, pages_failed: 0, agent_count: 1, created_at: "2026-06-28T08:00:00Z", updated_at: "2026-06-28T08:00:00Z" },
  { id: "7", institution_name: "Concordia University", institution_url: "https://www.concordia.ca/", status: "done", total_pages_found: 260, courses_extracted: 224, verification_score: 210, verification_total: 224, pages_scraped: 260, pages_failed: 3, agent_count: 4, created_at: "2026-06-26T09:00:00Z", updated_at: "2026-06-26T09:00:00Z" },
  { id: "8", institution_name: "Sheridan College", institution_url: "https://sheridancollege.ca", status: "review", total_pages_found: 110, courses_extracted: 96, verification_score: 90, verification_total: 96, pages_scraped: 110, pages_failed: 1, agent_count: 2, created_at: "2026-06-24T09:00:00Z", updated_at: "2026-06-24T09:00:00Z" },
  { id: "9", institution_name: "Auckland Institute of Studies", institution_url: "https://ais.ac.nz", status: "extracting", total_pages_found: 60, courses_extracted: 48, verification_score: 0, verification_total: 0, pages_scraped: 48, pages_failed: 0, agent_count: 0, created_at: "2026-08-07T02:00:00Z", updated_at: "2026-08-07T02:00:00Z" },
  { id: "10", institution_name: "RMIT University", institution_url: "https://www.rmit.edu.au", status: "pending", total_pages_found: 200, courses_extracted: 3, verification_score: 0, verification_total: 0, pages_scraped: 3, pages_failed: 0, agent_count: 0, created_at: "2026-08-07T02:30:00Z", updated_at: "2026-08-07T02:30:00Z" },
  { id: "11", institution_name: "Torrens University", institution_url: "https://www.torrens.edu.au", status: "declined", total_pages_found: 140, courses_extracted: 0, verification_score: 0, verification_total: 0, pages_scraped: 140, pages_failed: 0, agent_count: 0, created_at: "2026-06-20T09:00:00Z", updated_at: "2026-06-20T09:00:00Z" },
];

export const allExtractionsMockApi = {
  getJobs: async (): Promise<ExtractionJob[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs");
    await delay(300);
    return mockJobs;
  },

  getJob: async (id: string): Promise<ExtractionJob> => {
    console.log("[mock] GET /admin/data-extraction/jobs/" + id);
    await delay(200);
    const job = mockJobs.find((j) => j.id === id);
    if (!job) throw new Error("Job not found");
    return job;
  },

  createJob: async (params: CreateJobParams): Promise<ExtractionJob> => {
    console.log("[mock] POST /admin/data-extraction/jobs", params);
    await delay(400);
    const job: ExtractionJob = {
      id: crypto.randomUUID(),
      institution_name: null,
      institution_url: params.institution_url,
      status: "pending",
      total_pages_found: 0,
      courses_extracted: 0,
      verification_score: 0,
      verification_total: 0,
      pages_scraped: 0,
      pages_failed: 0,
      agent_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockJobs = [job, ...mockJobs];
    return job;
  },

  declineJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/decline");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "declined" } : j));
  },

  deleteJob: async (id: string): Promise<void> => {
    console.log("[mock] DELETE /admin/data-extraction/jobs/" + id);
    await delay(200);
    mockJobs = mockJobs.filter((j) => j.id !== id);
  },

  pauseJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/pause");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "paused" } : j));
  },

  resumeJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/resume");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "extracting" } : j));
  },

  promoteJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/" + id + "/promote");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "exported" } : j));
  },

  stopAllExtraction: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/stop-all");
    await delay(200);
    mockJobs = mockJobs.map((j) => (j.id === id ? { ...j, status: "paused" } : j));
  },

  resetPipeline: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/reset-pipeline");
    await delay(200);
    mockJobs = mockJobs.map((j) =>
      j.id === id
        ? { ...j, status: "pending", total_pages_found: 0, courses_extracted: 0, pages_scraped: 0, pages_failed: 0 }
        : j,
    );
  },

  getJobFull: async (id: string): Promise<JobFull> => {
    console.log("[mock] GET /admin/data-extraction/jobs/" + id + " (full)");
    await delay(300);
    const job = mockJobs.find((j) => j.id === id);
    if (!job) throw new Error("Job not found");
    const now = new Date().toISOString();
    return {
      job,
      overview: job.institution_name
        ? {
            id: `${id}-overview`,
            name: job.institution_name,
            website: job.institution_url,
            description: "A leading institution offering a wide range of programs.",
            country: "Canada",
            city: "Edmonton",
            state: null,
            logo_url: null,
            email: "admissions@example.edu",
            phone: "+1 555 0100",
            address: null,
            zip_code: null,
            facebook_url: null,
            instagram_url: null,
            twitter_url: null,
            linkedin_url: null,
            youtube_url: null,
            updated_at: now,
          }
        : null,
      campuses: job.agent_count ? [{ id: "c1", updated_at: now }] : [],
      agents: Array.from({ length: job.agent_count ?? 0 }, (_, i) => ({ id: `a${i}`, updated_at: now })),
      courses: Array.from({ length: job.courses_extracted }, (_, i) => ({
        id: `co${i}`,
        name: `Course ${i + 1}`,
        verification_status: i % 3 === 0 ? "confirmed" : "pending",
        updated_at: now,
      })),
      courseLinks: {
        course_fees: [],
        intakes: [],
        eligibility_requirements: [],
        study_units: [],
        study_options: [],
        accreditations: [],
      },
    };
  },
};
