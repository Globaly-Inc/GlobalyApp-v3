import type { Application, ApplicationStatus, CreateJobInput, Job, UpdateJobInput } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextId = 2;
let mockJobs: Job[] = [
  {
    id: 1,
    title: "Student Advisor",
    description: "Guide prospective students through application and enrolment.",
    job_type: "full_time",
    location_city: "Sydney",
    is_remote: false,
    pay_min: "60000",
    pay_max: "75000",
    pay_currency: "AUD",
    pay_unit: "year",
    is_published: true,
    closing_date: null,
    applicant_count: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockApplications: Record<number, Application[]> = {
  1: [
    { id: 1, job_id: 1, applicant_name: "Priya Sharma", applicant_email: "priya.sharma@example.com", status: "applied", cover_note: "3 years in student services.", resume_url: null, created_at: new Date().toISOString() },
  ],
};

export const businessJobsMockApi = {
  listJobs: async (): Promise<Job[]> => {
    console.log("[mock] GET /jobs/jobs");
    await delay(150);
    return mockJobs;
  },

  createJob: async (input: CreateJobInput): Promise<Job> => {
    console.log("[mock] POST /jobs/jobs", input);
    await delay(200);
    const job: Job = {
      id: nextId++,
      title: input.title,
      description: input.description ?? null,
      job_type: input.job_type ?? null,
      location_city: input.location_city ?? null,
      is_remote: input.is_remote,
      pay_min: input.pay_min != null ? String(input.pay_min) : null,
      pay_max: input.pay_max != null ? String(input.pay_max) : null,
      pay_currency: input.pay_currency ?? null,
      pay_unit: input.pay_unit ?? null,
      is_published: false,
      closing_date: input.closing_date ?? null,
      applicant_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockJobs = [job, ...mockJobs];
    mockApplications[job.id] = [];
    return job;
  },

  updateJob: async (jobId: number, input: UpdateJobInput): Promise<Job> => {
    console.log("[mock] PATCH /jobs/jobs/:id", { jobId, input });
    await delay(150);
    const existing = mockJobs.find((j) => j.id === jobId);
    if (!existing) throw new Error("Job posting not found");
    const updated = {
      ...existing,
      ...input,
      pay_min: input.pay_min != null ? String(input.pay_min) : existing.pay_min,
      pay_max: input.pay_max != null ? String(input.pay_max) : existing.pay_max,
      updated_at: new Date().toISOString(),
    };
    mockJobs = mockJobs.map((j) => (j.id === jobId ? updated : j));
    return updated;
  },

  deleteJob: async (jobId: number): Promise<void> => {
    console.log("[mock] DELETE /jobs/jobs/:id", { jobId });
    await delay(150);
    mockJobs = mockJobs.filter((j) => j.id !== jobId);
  },

  listApplications: async (jobId: number): Promise<Application[]> => {
    console.log("[mock] GET /jobs/jobs/:id/applications", { jobId });
    await delay(150);
    return mockApplications[jobId] ?? [];
  },

  reviewApplication: async (jobId: number, applicationId: number, status: ApplicationStatus): Promise<Application> => {
    console.log("[mock] POST .../applications/:id/review", { jobId, applicationId, status });
    await delay(200);
    const list = mockApplications[jobId] ?? [];
    const target = list.find((a) => a.id === applicationId);
    if (!target) throw new Error("Application not found");
    const updated = { ...target, status };
    mockApplications[jobId] = list.map((a) => (a.id === applicationId ? updated : a));
    return updated;
  },
};
