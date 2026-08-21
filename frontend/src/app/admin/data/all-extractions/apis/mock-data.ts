import type {
  Accreditation,
  AgentFull,
  AgentRun,
  CampusFull,
  CreateAgentParams,
  CourseFee,
  CourseFeeParams,
  CourseFull,
  CourseLinks,
  CreateCampusParams,
  CreateCourseParams,
  CreateJobParams,
  EligibilityParams,
  EligibilityRequirement,
  EditableTable,
  ExtractionJob,
  Intake,
  IntakeParams,
  JobEvent,
  JobFull,
  JunctionSlug,
  Paginated,
  QueueItem,
  StudyOption,
  StudyOptionParams,
  StudyUnit,
  StudyUnitParams,
  UpdateContextParams,
  UpdateCourseParams,
} from "./types";

import { MODE_STATUS_FILTER, type DashboardMode } from "../const";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EMPTY_COURSE_LINKS: CourseLinks = {
  course_fees: [], intakes: [], eligibility_requirements: [], study_units: [],
  study_options: [], accreditations: [],
  fee_assignments: [], intake_assignments: [], eligibility_assignments: [],
  study_unit_assignments: [], study_option_assignments: [], accreditation_assignments: [],
  course_campuses: [],
};

let mockJobs: ExtractionJob[] = [
  { id: "1", institution_name: "Concordia University of Edmonton", institution_url: "https://concordia.ab.ca/", status: "done", total_pages_found: 40, courses_extracted: 33, verification_score: 30, verification_total: 33, pages_scraped: 40, pages_failed: 0, agent_count: 2, created_at: "2026-06-30T09:00:00Z", updated_at: "2026-06-30T09:00:00Z" },
  { id: "2", institution_name: "Crandall University", institution_url: "https://www.crandallu.ca/", status: "done", total_pages_found: 25, courses_extracted: 20, verification_score: 19, verification_total: 20, pages_scraped: 25, pages_failed: 0, agent_count: 1, created_at: "2026-06-30T08:00:00Z", updated_at: "2026-06-30T08:00:00Z" },
  { id: "3", institution_name: "Aboard Training Australia", institution_url: "https://ataustralia.edu.au/", status: "done", total_pages_found: 12, courses_extracted: 10, verification_score: 10, verification_total: 10, pages_scraped: 12, pages_failed: 0, agent_count: 3, created_at: "2026-06-30T07:00:00Z", updated_at: "2026-06-30T07:00:00Z" },
  { id: "4", institution_name: "Hillshire International College", institution_url: "https://hillshire.edu.au/", status: "done", total_pages_found: 15, courses_extracted: 12, verification_score: 12, verification_total: 12, pages_scraped: 15, pages_failed: 0, agent_count: 1, created_at: "2026-06-29T10:00:00Z", updated_at: "2026-06-29T10:00:00Z" },
  { id: "5", institution_name: "University of Technology Sydney (UTS)", institution_url: "https://www.uts.edu.au", status: "completed", total_pages_found: 0, courses_extracted: 0, verification_score: 0, verification_total: 0, pages_scraped: 0, pages_failed: 0, agent_count: 0, created_at: "2026-06-28T09:00:00Z", updated_at: "2026-06-28T09:00:00Z" },
  { id: "6", institution_name: "Apsley College", institution_url: "https://apsley.nsw.edu.au/", status: "done", total_pages_found: 12, courses_extracted: 10, verification_score: 9, verification_total: 10, pages_scraped: 12, pages_failed: 0, agent_count: 1, created_at: "2026-06-28T08:00:00Z", updated_at: "2026-06-28T08:00:00Z" },
  { id: "7", institution_name: "Concordia University", institution_url: "https://www.concordia.ca/", status: "done", total_pages_found: 260, courses_extracted: 224, verification_score: 210, verification_total: 224, pages_scraped: 260, pages_failed: 3, agent_count: 4, created_at: "2026-06-26T09:00:00Z", updated_at: "2026-06-26T09:00:00Z" },
  { id: "8", institution_name: "Sheridan College", institution_url: "https://sheridancollege.ca", status: "review", total_pages_found: 110, courses_extracted: 96, verification_score: 90, verification_total: 96, pages_scraped: 110, pages_failed: 1, agent_count: 2, created_at: "2026-06-24T09:00:00Z", updated_at: "2026-06-24T09:00:00Z" },
  { id: "9", institution_name: "Auckland Institute of Studies", institution_url: "https://ais.ac.nz", status: "extracting", total_pages_found: 60, courses_extracted: 48, verification_score: 0, verification_total: 0, pages_scraped: 48, pages_failed: 0, agent_count: 0, campus_count: 2, created_at: "2026-08-07T02:00:00Z", updated_at: "2026-08-07T02:00:00Z", pipeline_progress: { mapping: { status: "done", total: 60, done: 60 }, intelligence: { status: "done", total: 1, done: 1 }, scraping: { status: "done", total: 60, done: 48 }, extracting: { status: "processing", total: 48, done: 32 } } },
  { id: "10", institution_name: "RMIT University", institution_url: "https://www.rmit.edu.au", status: "pending", total_pages_found: 200, courses_extracted: 3, verification_score: 0, verification_total: 0, pages_scraped: 3, pages_failed: 0, agent_count: 0, created_at: "2026-08-07T02:30:00Z", updated_at: "2026-08-07T02:30:00Z" },
  { id: "11", institution_name: "Torrens University", institution_url: "https://www.torrens.edu.au", status: "declined", total_pages_found: 140, courses_extracted: 0, verification_score: 0, verification_total: 0, pages_scraped: 140, pages_failed: 0, agent_count: 0, created_at: "2026-06-20T09:00:00Z", updated_at: "2026-06-20T09:00:00Z" },
];

export const allExtractionsMockApi = {
  getJobs: async (mode: DashboardMode): Promise<ExtractionJob[]> => {
    console.log("[mock] GET /admin/data-extraction/jobs-filtered (mode: " + mode + ")");
    await delay(300);
    const statuses = MODE_STATUS_FILTER[mode];
    return statuses ? mockJobs.filter((j) => statuses.includes(j.status)) : mockJobs;
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

  rerunJob: async (id: string): Promise<void> => {
    console.log("[mock] POST /admin/data-extraction/jobs/" + id + "/rerun");
    await delay(200);
    mockJobs = mockJobs.map((j) =>
      j.id === id
        ? { ...j, status: "processing", total_pages_found: 0, courses_extracted: 0, pages_scraped: 0, pages_failed: 0 }
        : j,
    );
  },

  // ── Tab data endpoints ──────────────────────────────────────────

  getCourseLinks: async (jobId: string): Promise<CourseLinks> => {
    console.log("[mock] GET course-links for job", jobId);
    await delay(200);
    return EMPTY_COURSE_LINKS;
  },

  getCourses: async (
    jobId: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ): Promise<Paginated<CourseFull>> => {
    console.log("[mock] GET courses for job", jobId, params);
    await delay(300);
    const job = mockJobs.find((j) => j.id === jobId);
    const count = job?.courses_extracted ?? 2;
    const now = new Date().toISOString();
    const all = Array.from({ length: count }, (_, i) => ({
      id: `course-${i}`,
      name: `Course ${i + 1}`,
      short_name: null,
      source_url: null,
      degree_level: i % 2 === 0 ? "bachelor" : "master",
      subject_area: "General Studies",
      duration_weeks: 104,
      study_mode: "full-time",
      description: `Mock course ${i + 1} description`,
      domestic_fee_total: 15000 + i * 500,
      domestic_currency: "CAD",
      international_fee_total: 25000 + i * 500,
      international_currency: "CAD",
      awarding_institution: null,
      career_paths: null,
      verification_status: i % 3 === 0 ? "confirmed" : "pending",
      created_at: now,
      updated_at: now,
    }));
    const filtered = all
      .filter((c) => !params.search || c.name.toLowerCase().includes(params.search.toLowerCase()))
      .filter((c) => !params.status || c.verification_status === params.status);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const statusCounts = Object.entries(
      all.reduce<Record<string, number>>((acc, c) => {
        const s = c.verification_status ?? "unverified";
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([status, count]) => ({ status, count }));
    return {
      data: filtered.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
      statusCounts,
    };
  },

  createCourse: async (jobId: string, params: CreateCourseParams): Promise<CourseFull> => {
    console.log("[mock] POST course for job", jobId, params);
    await delay(300);
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), name: params.name, short_name: null, source_url: params.source_url ?? null, degree_level: params.degree_level ?? null, subject_area: params.subject_area ?? null, duration_weeks: params.duration_weeks ?? null, study_mode: params.study_mode ?? null, description: params.description ?? null, domestic_fee_total: null, domestic_currency: null, international_fee_total: null, international_currency: null, awarding_institution: null, career_paths: null, verification_status: null, created_at: now, updated_at: now };
  },

  updateCourse: async (id: string, params: UpdateCourseParams): Promise<void> => {
    console.log("[mock] PATCH course", id, params);
    await delay(200);
  },

  approveCourse: async (id: string): Promise<void> => {
    console.log("[mock] POST approve course", id);
    await delay(200);
  },

  rejectCourse: async (id: string): Promise<void> => {
    console.log("[mock] POST reject course", id);
    await delay(200);
  },

  bulkVerifyCourses: async (ids: string[], approve: boolean): Promise<void> => {
    console.log("[mock] POST bulk-verify courses", ids, approve);
    await delay(200);
  },

  getCampuses: async (jobId: string): Promise<CampusFull[]> => {
    console.log("[mock] GET campuses for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "campus-1", name: "Main Campus", address: "123 University Ave", city: "Edmonton", state: "AB", country: "Canada", phone: "+1 555 0100", email: "campus@example.edu", map_link: null, source_url: null, postcode: "T5J 1Z1", created_at: now, updated_at: now },
      { id: "campus-2", name: "Downtown Campus", address: "456 College St", city: "Edmonton", state: "AB", country: "Canada", phone: null, email: null, map_link: null, source_url: null, postcode: null, created_at: now, updated_at: now },
    ];
  },

  createCampus: async (params: CreateCampusParams): Promise<CampusFull> => {
    console.log("[mock] POST campus", params);
    await delay(300);
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(), name: params.name ?? null, address: params.address ?? null,
      city: params.city ?? null, state: params.state ?? null, country: params.country ?? null,
      phone: params.phone ?? null, email: params.email ?? null, map_link: params.map_link ?? null,
      source_url: params.source_url ?? null, postcode: params.postcode ?? null,
      created_at: now, updated_at: now,
    };
  },

  updateCampus: async (id: string, params: Record<string, unknown>): Promise<void> => {
    console.log("[mock] PATCH campus", id, params);
    await delay(200);
  },

  deleteCampus: async (id: string): Promise<void> => {
    console.log("[mock] DELETE campus", id);
    await delay(200);
  },

  getAgents: async (jobId: string): Promise<AgentFull[]> => {
    console.log("[mock] GET agents for job", jobId);
    await delay(250);
    const job = mockJobs.find((j) => j.id === jobId);
    const count = job?.agent_count ?? 1;
    const now = new Date().toISOString();
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent ${i + 1}`,
      country: "Canada",
      email: `agent${i + 1}@example.com`,
      phone: null,
      website: null,
      source_url: null,
      external_id: null,
      source_status: "active",
      address: null,
      city: null,
      state: null,
      postcode: null,
      created_at: now,
      updated_at: now,
    }));
  },

  createAgent: async (params: CreateAgentParams): Promise<AgentFull> => {
    console.log("[mock] POST agent", params);
    await delay(300);
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), name: params.name ?? null, country: params.country ?? null, email: params.email ?? null, phone: params.phone ?? null, website: params.website ?? null, source_url: null, external_id: null, source_status: "active", address: null, city: null, state: null, postcode: null, created_at: now, updated_at: now };
  },

  getAgentRuns: async (jobId: string): Promise<AgentRun[]> => {
    console.log("[mock] GET agent-runs for job", jobId);
    await delay(200);
    const now = new Date().toISOString();
    return [
      { id: "run-1", job_id: jobId, started_at: now, finished_at: now, status: "completed", provider: "crawl4ai", agents_found: 12, agents_new: 3, agents_updated: 9, agents_removed: 0, error_message: null },
    ];
  },

  updateAgent: async (id: string, params: Record<string, unknown>): Promise<void> => {
    console.log("[mock] PATCH agent", id, params);
    await delay(200);
  },

  deleteAgent: async (id: string): Promise<void> => {
    console.log("[mock] DELETE agent", id);
    await delay(200);
  },

  saveAndLearn: async (params: { table: EditableTable; id: string; patch: Record<string, unknown>; job_id?: string; source_url?: string }): Promise<void> => {
    console.log("[mock] POST save-and-learn", params);
    await delay(200);
  },

  updateContext: async (id: string, params: UpdateContextParams): Promise<void> => {
    console.log("[mock] PATCH context", id, params);
    await delay(200);
  },

  getQueue: async (jobId: string): Promise<QueueItem[]> => {
    console.log("[mock] GET queue for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "q1", job_id: jobId, url: "https://example.edu/page1", status: "completed", error: null, extracted_data: null, retry_count: 0, failure_class: null, processing_meta: {}, kind: "course", created_at: now, updated_at: now },
      { id: "q2", job_id: jobId, url: "https://example.edu/page2", status: "failed", error: "Timeout", extracted_data: null, retry_count: 2, failure_class: "timeout", processing_meta: {}, kind: "course", created_at: now, updated_at: now },
    ];
  },

  getEvents: async (jobId: string): Promise<JobEvent[]> => {
    console.log("[mock] GET events for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "e1", job_id: jobId, kind: "status_change", level: "info", phase: "scraping", message: "Job started scraping", data: {}, created_at: now },
      { id: "e2", job_id: jobId, kind: "status_change", level: "info", phase: "extracting", message: "Extraction began", data: {}, created_at: now },
    ];
  },

  retryQueueItem: async (id: string): Promise<void> => {
    console.log("[mock] POST retry queue item", id);
    await delay(200);
  },

  ignoreQueueItem: async (id: string): Promise<void> => {
    console.log("[mock] POST ignore queue item", id);
    await delay(200);
  },

  deleteQueueItem: async (id: string): Promise<void> => {
    console.log("[mock] DELETE queue item", id);
    await delay(200);
  },

  runStep: async (jobId: string, step: string, params?: Record<string, unknown>): Promise<void> => {
    console.log("[mock] POST run-step", jobId, step, params);
    await delay(400);
  },

  // ── Course Fees ────────────────────────────────────────────────

  getCourseFees: async (jobId: string): Promise<CourseFee[]> => {
    console.log("[mock] GET course-fees for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "fee-1", name: "Standard Tuition", student_type: "domestic", period_type: "Per Year", currency: "CAD", total_amount: 12500, created_at: now },
      { id: "fee-2", name: "International Tuition", student_type: "international", period_type: "Per Year", currency: "CAD", total_amount: 28000, created_at: now },
    ];
  },

  createCourseFee: async (params: { job_id: string } & CourseFeeParams): Promise<CourseFee> => {
    console.log("[mock] POST course-fee", params);
    await delay(300);
    return {
      id: crypto.randomUUID(), name: params.name ?? null, student_type: params.student_type ?? null,
      period_type: params.period_type ?? null, currency: params.currency ?? null,
      total_amount: params.total_amount ?? null, installments: params.installments ?? [],
      save_for_reuse: params.save_for_reuse ?? false, created_at: new Date().toISOString(),
    };
  },

  updateCourseFee: async (id: string, params: CourseFeeParams): Promise<void> => {
    console.log("[mock] PATCH course-fee", id, params);
    await delay(200);
  },

  deleteCourseFee: async (id: string): Promise<void> => {
    console.log("[mock] DELETE course-fee", id);
    await delay(200);
  },

  // ── Intakes ────────────────────────────────────────────────────

  getIntakes: async (jobId: string): Promise<Intake[]> => {
    console.log("[mock] GET intakes for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "intake-1", intake_name: "Semester 1 2026", start_date: "2026-02-15", end_date: "2026-06-30", orientation_date: "2026-02-10", admission_deadline: "2026-01-15", intake_month: 2, intake_year: 2026, created_at: now },
      { id: "intake-2", intake_name: "Semester 2 2026", start_date: "2026-07-20", end_date: "2026-11-30", orientation_date: "2026-07-15", admission_deadline: "2026-06-20", intake_month: 7, intake_year: 2026, created_at: now },
    ];
  },

  createIntake: async (params: { job_id: string } & IntakeParams): Promise<Intake> => {
    console.log("[mock] POST intake", params);
    await delay(300);
    return {
      id: crypto.randomUUID(), intake_name: params.intake_name ?? null, start_date: params.start_date ?? null,
      end_date: params.end_date ?? null, orientation_date: params.orientation_date ?? null,
      admission_deadline: params.admission_deadline ?? null, intake_month: params.intake_month ?? null,
      intake_year: params.intake_year ?? null, created_at: new Date().toISOString(),
    };
  },

  deleteIntake: async (id: string): Promise<void> => {
    console.log("[mock] DELETE intake", id);
    await delay(200);
  },

  // ── Eligibility Requirements ───────────────────────────────────

  getEligibilityRequirements: async (jobId: string): Promise<EligibilityRequirement[]> => {
    console.log("[mock] GET eligibility-requirements for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "elig-1", name: "Standard Academic Entry", applicable_to: "international", min_degree_level: "High School Diploma", score_type: "percentage", min_score: 65, min_score_percent: 65, description: "Minimum academic requirement for international applicants.", created_at: now },
      { id: "elig-2", name: "Domestic Entry", applicable_to: "domestic", min_degree_level: "High School Diploma", score_type: "percentage", min_score: 55, min_score_percent: 55, description: null, created_at: now },
    ];
  },

  createEligibilityRequirement: async (params: { job_id: string } & EligibilityParams): Promise<EligibilityRequirement> => {
    console.log("[mock] POST eligibility-requirement", params);
    await delay(300);
    return {
      id: crypto.randomUUID(), name: params.name ?? null, applicable_to: params.applicable_to ?? null,
      min_degree_level: params.min_degree_level ?? null, score_type: params.score_type ?? null,
      min_score: params.min_score ?? null, min_score_percent: params.min_score_percent ?? null,
      description: params.description ?? null, language_tests: params.language_tests ?? [],
      academic_tests: params.academic_tests ?? [], created_at: new Date().toISOString(),
    };
  },

  updateEligibilityRequirement: async (id: string, params: EligibilityParams): Promise<void> => {
    console.log("[mock] PATCH eligibility-requirement", id, params);
    await delay(200);
  },

  deleteEligibilityRequirement: async (id: string): Promise<void> => {
    console.log("[mock] DELETE eligibility-requirement", id);
    await delay(200);
  },

  // ── Study Units ──────────────────────────────────────────────────

  getStudyUnits: async (jobId: string): Promise<StudyUnit[]> => {
    console.log("[mock] GET study-units for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "su-1", unit_code: "COMP1010", unit_name: "Introduction to Computer Science", credit_points: 6, unit_type: "compulsory", description: null, created_at: now },
      { id: "su-2", unit_code: "MATH2020", unit_name: "Linear Algebra", credit_points: 3, unit_type: "elective", description: null, created_at: now },
    ];
  },

  createStudyUnit: async (params: { job_id: string } & StudyUnitParams & { unit_name: string }): Promise<StudyUnit> => {
    console.log("[mock] POST study-unit", params);
    await delay(300);
    return {
      id: crypto.randomUUID(), unit_code: params.unit_code ?? null, unit_name: params.unit_name,
      credit_points: params.credit_points ?? null, unit_type: params.unit_type ?? null,
      description: params.description ?? null, created_at: new Date().toISOString(),
    };
  },

  updateStudyUnit: async (id: string, params: StudyUnitParams): Promise<void> => {
    console.log("[mock] PATCH study-unit", id, params);
    await delay(200);
  },

  deleteStudyUnit: async (id: string): Promise<void> => {
    console.log("[mock] DELETE study-unit", id);
    await delay(200);
  },

  // ── Study Options ────────────────────────────────────────────────

  getStudyOptions: async (jobId: string): Promise<StudyOption[]> => {
    console.log("[mock] GET study-options for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "so-1", name: "On Campus Full-Time", study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years", applicable_to: "both", created_at: now },
      { id: "so-2", name: "Online Part-Time", study_mode: "online", study_load: "part_time", duration_value: 6, duration_unit: "years", applicable_to: "international", created_at: now },
    ];
  },

  createStudyOption: async (params: { job_id: string; course_id?: string } & StudyOptionParams): Promise<StudyOption> => {
    console.log("[mock] POST study-option", params);
    await delay(300);
    return {
      id: crypto.randomUUID(), name: params.name ?? null, study_mode: params.study_mode ?? null,
      study_load: params.study_load ?? null, duration_value: params.duration_value ?? null,
      duration_unit: params.duration_unit ?? null, applicable_to: params.applicable_to ?? null,
      save_for_reuse: params.save_for_reuse ?? false, created_at: new Date().toISOString(),
    };
  },

  updateStudyOption: async (id: string, params: Record<string, unknown>): Promise<void> => {
    console.log("[mock] PATCH study-option", id, params);
    await delay(200);
  },

  deleteStudyOption: async (id: string): Promise<void> => {
    console.log("[mock] DELETE study-option", id);
    await delay(200);
  },

  assignJunction: async (junction: JunctionSlug, params: Record<string, string>): Promise<void> => {
    console.log("[mock] POST junction assign", junction, params);
    await delay(200);
  },

  unassignJunction: async (junction: JunctionSlug, params: Record<string, string>): Promise<void> => {
    console.log("[mock] DELETE junction assign", junction, params);
    await delay(200);
  },

  // ── Accreditations ───────────────────────────────────────────────

  getAccreditations: async (jobId: string): Promise<Accreditation[]> => {
    console.log("[mock] GET accreditations for job", jobId);
    await delay(250);
    const now = new Date().toISOString();
    return [
      { id: "acc-1", name: "AACSB", issuing_organization: "Association to Advance Collegiate Schools of Business", website: "https://www.aacsb.edu", description: null, created_at: now },
      { id: "acc-2", name: "TEQSA", issuing_organization: "Tertiary Education Quality and Standards Agency", website: "https://www.teqsa.gov.au", description: null, created_at: now },
    ];
  },

  createAccreditation: async (params: { job_id: string; name: string; issuing_organization?: string }): Promise<Accreditation> => {
    console.log("[mock] POST accreditation", params);
    await delay(300);
    return { id: crypto.randomUUID(), name: params.name, issuing_organization: params.issuing_organization ?? null, website: null, description: null, created_at: new Date().toISOString() };
  },

  deleteAccreditation: async (id: string): Promise<void> => {
    console.log("[mock] DELETE accreditation", id);
    await delay(200);
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
      courseLinks: EMPTY_COURSE_LINKS,
    };
  },
};
