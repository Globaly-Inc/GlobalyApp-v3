import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import { MODE_STATUS_FILTER, type DashboardMode } from "../const";
import type {
  Accreditation,
  AgentFull,
  AgentRow,
  AgentRun,
  CreateAgentParams,
  CampusFull,
  CampusRow,
  CourseFee,
  CourseFeeParams,
  CourseFull,
  CourseLinks,
  CourseRow,
  CreateCampusParams,
  CreateCourseParams,
  CreateJobParams,
  EligibilityParams,
  EligibilityRequirement,
  EditableTable,
  ExtractionJob,
  Intake,
  IntakeParams,
  InstitutionOverview,
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

export const allExtractionsRealApi = {
  // jobs-filtered (not /jobs) for every mode — it's the only list endpoint that
  // attaches campus_count/agent_count, which the row shows.
  getJobs: async (mode: DashboardMode): Promise<ExtractionJob[]> => {
    const params = new URLSearchParams({ limit: "500" });
    const statuses = MODE_STATUS_FILTER[mode];
    if (statuses) params.set("statuses", statuses.join(","));
    if (mode === "ai-ongoing") params.set("exclude_source_type", "agentcis");
    const { jobs } = await httpGet<{ jobs: ExtractionJob[] }>(`/admin/data-extraction/jobs-filtered?${params}`);
    return jobs;
  },

  getJob: async (id: string): Promise<ExtractionJob> => {
    const { job } = await httpGet<{ job: ExtractionJob }>(`/admin/data-extraction/jobs/${id}`);
    return job;
  },

  // POST /jobs only returns { id } — the row is otherwise identical to a freshly
  // inserted "pending" job, so build the rest client-side rather than refetch.
  createJob: async (params: CreateJobParams): Promise<ExtractionJob> => {
    const { id } = await httpPost<{ id: string }>("/admin/data-extraction/jobs", params);
    const now = new Date().toISOString();
    return {
      id,
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
      created_at: now,
      updated_at: now,
    };
  },

  declineJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/decline`, {}),

  deleteJob: (id: string): Promise<void> => httpDelete(`/admin/data-extraction/jobs/${id}`),

  pauseJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/pause`, {}),

  resumeJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/jobs/${id}/resume`, {}),

  promoteJob: (id: string): Promise<void> => httpPost(`/admin/data-extraction/${id}/promote`, {}),

  stopAllExtraction: (id: string): Promise<void> =>
    httpPost(`/admin/data-extraction/jobs/${id}/stop-all`, {}),

  resetPipeline: (id: string): Promise<void> =>
    httpPost(`/admin/data-extraction/jobs/${id}/reset-pipeline`, {}),

  // Combines the job-detail endpoint with the four tables the Overview tab's
  // "Extraction Details by Tab" cards summarize — one round trip per card group,
  // same shape V2's OverviewTab.loadSummary() fetched.
  getJobFull: async (id: string): Promise<JobFull> => {
    const [detail, campusesRes, agentsRes, coursesRes, courseLinks] = await Promise.all([
      httpGet<{ job: ExtractionJob; overview: InstitutionOverview | null }>(`/admin/data-extraction/jobs/${id}`),
      httpGet<{ campuses: CampusRow[] }>(`/admin/data-extraction/jobs/${id}/campuses`),
      httpGet<{ agents: AgentRow[] }>(`/admin/data-extraction/jobs/${id}/agents`),
      httpGet<Paginated<CourseRow>>(`/admin/data-extraction/jobs/${id}/courses?limit=100`),
      httpGet<CourseLinks>(`/admin/data-extraction/jobs/${id}/course-links`),
    ]);
    return {
      job: detail.job,
      overview: detail.overview,
      campuses: campusesRes.campuses,
      agents: agentsRes.agents,
      courses: coursesRes.data,
      courseLinks,
    };
  },

  // ── Tab data endpoints ──────────────────────────────────────────

  getCourseLinks: (jobId: string): Promise<CourseLinks> =>
    httpGet<CourseLinks>(`/admin/data-extraction/jobs/${jobId}/course-links`),

  getCourses: (
    jobId: string,
    params: { page?: number; limit?: number; search?: string; status?: string } = {},
  ): Promise<Paginated<CourseFull>> => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    return httpGet<Paginated<CourseFull>>(`/admin/data-extraction/jobs/${jobId}/courses?${query}`);
  },

  createCourse: async (jobId: string, params: CreateCourseParams): Promise<CourseFull> => {
    const res = await httpPost<{ id: string; name: string; created_at: string; updated_at: string }>(
      `/admin/data-extraction/jobs/${jobId}/courses`, params,
    );
    return { ...params, id: res.id, name: params.name, short_name: null, source_url: params.source_url ?? null, degree_level: params.degree_level ?? null, subject_area: params.subject_area ?? null, duration_weeks: params.duration_weeks ?? null, study_mode: params.study_mode ?? null, description: params.description ?? null, domestic_fee_total: null, domestic_currency: null, international_fee_total: null, international_currency: null, awarding_institution: null, career_paths: null, verification_status: null, created_at: res.created_at, updated_at: res.updated_at };
  },

  updateCourse: async (id: string, params: UpdateCourseParams): Promise<void> => {
    await httpPatch(`/admin/data-extraction/courses/${id}`, params);
  },

  approveCourse: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/courses/${id}/approve`, {});
  },

  bulkVerifyCourses: async (ids: string[], approve: boolean): Promise<void> => {
    await httpPost(`/admin/data-extraction/courses/bulk-verify`, { ids, approve });
  },

  rejectCourse: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/courses/${id}/reject`, {});
  },

  getCampuses: async (jobId: string): Promise<CampusFull[]> => {
    const { campuses } = await httpGet<{ campuses: CampusFull[] }>(`/admin/data-extraction/jobs/${jobId}/campuses`);
    return campuses;
  },

  createCampus: async (params: CreateCampusParams): Promise<CampusFull> => {
    const res = await httpPost<{ id: string; created_at: string }>(`/admin/data-extraction/campuses`, params);
    return { id: res.id, name: params.name ?? null, address: null, city: params.city ?? null, state: null, country: params.country ?? null, phone: null, email: null, map_link: null, source_url: null, postcode: null, created_at: res.created_at, updated_at: res.created_at };
  },

  updateCampus: async (id: string, params: Record<string, unknown>): Promise<void> => {
    await httpPatch(`/admin/data-extraction/campuses/${id}`, params);
  },

  deleteCampus: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/campuses/${id}`);
  },

  getAgents: async (jobId: string): Promise<AgentFull[]> => {
    const { agents } = await httpGet<{ agents: AgentFull[] }>(`/admin/data-extraction/jobs/${jobId}/agents`);
    return agents;
  },

  createAgent: async (params: CreateAgentParams): Promise<AgentFull> => {
    const res = await httpPost<{ id: string; created_at: string }>(`/admin/data-extraction/agents`, params);
    return { id: res.id, name: params.name ?? null, country: params.country ?? null, email: params.email ?? null, phone: params.phone ?? null, website: params.website ?? null, source_url: null, external_id: null, source_status: "active", address: null, city: null, state: null, postcode: null, created_at: res.created_at, updated_at: res.created_at };
  },

  getAgentRuns: async (jobId: string): Promise<AgentRun[]> => {
    const { runs } = await httpGet<{ runs: AgentRun[] }>(`/admin/data-extraction/jobs/${jobId}/agent-runs`);
    return runs;
  },

  updateAgent: async (id: string, params: Record<string, unknown>): Promise<void> => {
    await httpPatch(`/admin/data-extraction/agents/${id}`, params);
  },

  deleteAgent: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/agents/${id}`);
  },

  // Patches one row and records the correction as a lesson for the extractor.
  saveAndLearn: async (params: { table: EditableTable; id: string; patch: Record<string, unknown>; job_id?: string; source_url?: string }): Promise<void> => {
    await httpPost("/admin/data-extraction/save-and-learn", params);
  },

  updateContext: async (id: string, params: UpdateContextParams): Promise<void> => {
    await httpPatch(`/admin/data-extraction/jobs/${id}/context`, params);
  },

  getQueue: async (jobId: string): Promise<QueueItem[]> => {
    const { queue } = await httpGet<{ queue: QueueItem[] }>(`/admin/data-extraction/jobs/${jobId}/queue`);
    return queue;
  },

  getEvents: async (jobId: string): Promise<JobEvent[]> => {
    const { events } = await httpGet<{ events: JobEvent[] }>(`/admin/data-extraction/jobs/${jobId}/events`);
    return events;
  },

  retryQueueItem: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/queue/${id}/retry`, {});
  },

  ignoreQueueItem: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/queue/${id}/ignore`, {});
  },

  deleteQueueItem: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/queue/${id}`);
  },

  runStep: async (jobId: string, step: string, params?: Record<string, unknown>): Promise<void> => {
    await httpPost(`/admin/data-extraction/jobs/${jobId}/run-step`, { step, params });
  },

  // ── Course Fees ────────────────────────────────────────────────

  getCourseFees: async (jobId: string): Promise<CourseFee[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/course-fees
    return [] as CourseFee[];
  },

  createCourseFee: async (params: { job_id: string } & CourseFeeParams): Promise<CourseFee> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/course-fees", params);
    return {
      id: res.id, name: params.name ?? null, student_type: params.student_type ?? null,
      period_type: params.period_type ?? null, currency: params.currency ?? null,
      total_amount: params.total_amount ?? null, installments: params.installments ?? [],
      save_for_reuse: params.save_for_reuse ?? false, created_at: res.created_at,
    };
  },

  updateCourseFee: async (id: string, params: CourseFeeParams): Promise<void> => {
    await httpPatch(`/admin/data-extraction/course-fees/${id}`, params);
  },

  deleteCourseFee: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/course-fees/${id}`);
  },

  // ── Intakes ────────────────────────────────────────────────────

  getIntakes: async (jobId: string): Promise<Intake[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/intakes
    return [] as Intake[];
  },

  createIntake: async (params: { job_id: string } & IntakeParams): Promise<Intake> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/intakes", params);
    return {
      id: res.id, intake_name: params.intake_name ?? null, start_date: params.start_date ?? null,
      end_date: params.end_date ?? null, orientation_date: params.orientation_date ?? null,
      admission_deadline: params.admission_deadline ?? null, intake_month: params.intake_month ?? null,
      intake_year: params.intake_year ?? null, created_at: res.created_at,
    };
  },

  deleteIntake: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/intakes/${id}`);
  },

  // ── Eligibility Requirements ───────────────────────────────────

  getEligibilityRequirements: async (jobId: string): Promise<EligibilityRequirement[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/eligibility-requirements
    return [] as EligibilityRequirement[];
  },

  createEligibilityRequirement: async (params: { job_id: string } & EligibilityParams): Promise<EligibilityRequirement> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/eligibility-requirements", params);
    return {
      id: res.id, name: params.name ?? null, applicable_to: params.applicable_to ?? null,
      min_degree_level: params.min_degree_level ?? null, score_type: params.score_type ?? null,
      min_score: params.min_score ?? null, min_score_percent: params.min_score_percent ?? null,
      description: params.description ?? null, language_tests: params.language_tests ?? [],
      academic_tests: params.academic_tests ?? [], created_at: res.created_at,
    };
  },

  updateEligibilityRequirement: async (id: string, params: EligibilityParams): Promise<void> => {
    await httpPatch(`/admin/data-extraction/eligibility-requirements/${id}`, params);
  },

  deleteEligibilityRequirement: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/eligibility-requirements/${id}`);
  },

  // ── Study Units ──────────────────────────────────────────────────

  getStudyUnits: async (jobId: string): Promise<StudyUnit[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/study-units
    return [] as StudyUnit[];
  },

  createStudyUnit: async (params: { job_id: string } & StudyUnitParams & { unit_name: string }): Promise<StudyUnit> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/study-units", params);
    return {
      id: res.id, unit_code: params.unit_code ?? null, unit_name: params.unit_name,
      credit_points: params.credit_points ?? null, unit_type: params.unit_type ?? null,
      description: params.description ?? null, created_at: res.created_at,
    };
  },

  updateStudyUnit: async (id: string, params: StudyUnitParams): Promise<void> => {
    await httpPatch(`/admin/data-extraction/study-units/${id}`, params);
  },

  deleteStudyUnit: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/study-units/${id}`);
  },

  // ── Study Options ────────────────────────────────────────────────

  getStudyOptions: async (jobId: string): Promise<StudyOption[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/study-options
    return [] as StudyOption[];
  },

  createStudyOption: async (params: { job_id: string; course_id?: string } & StudyOptionParams): Promise<StudyOption> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/study-options", params);
    return {
      id: res.id, name: params.name ?? null, study_mode: params.study_mode ?? null,
      study_load: params.study_load ?? null, duration_value: params.duration_value ?? null,
      duration_unit: params.duration_unit ?? null, applicable_to: params.applicable_to ?? null,
      save_for_reuse: params.save_for_reuse ?? false, created_at: res.created_at,
    };
  },

  updateStudyOption: async (id: string, params: Record<string, unknown>): Promise<void> => {
    await httpPatch(`/admin/data-extraction/study-options/${id}`, params);
  },

  // ── Course ↔ entity links ────────────────────────────────────────

  assignJunction: async (junction: JunctionSlug, params: { job_id: string; course_id: string; entity_id: string }): Promise<void> => {
    await httpPost(`/admin/data-extraction/junctions/${junction}/assign`, params);
  },

  // DELETE with a body — that's what the backend's junction route reads.
  unassignJunction: async (junction: JunctionSlug, params: { job_id: string; course_id: string; entity_id: string }): Promise<void> => {
    await httpDelete(`/admin/data-extraction/junctions/${junction}/assign`, {
      body: JSON.stringify(params),
      headers: { "Content-Type": "application/json" },
    });
  },

  deleteStudyOption: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/study-options/${id}`);
  },

  // ── Accreditations (staged/extraction) ───────────────────────────

  getAccreditations: async (jobId: string): Promise<Accreditation[]> => {
    // TODO: backend needs GET /admin/data-extraction/jobs/:id/accreditations
    return [] as Accreditation[];
  },

  createAccreditation: async (params: { job_id: string; name: string; issuing_organization?: string }): Promise<Accreditation> => {
    const res = await httpPost<{ id: string; created_at: string }>("/admin/data-extraction/staged-accreditations", params);
    return { id: res.id, name: params.name, issuing_organization: params.issuing_organization ?? null, website: null, description: null, created_at: res.created_at };
  },

  deleteAccreditation: async (id: string): Promise<void> => {
    await httpDelete(`/admin/data-extraction/staged-accreditations/${id}`);
  },
};
