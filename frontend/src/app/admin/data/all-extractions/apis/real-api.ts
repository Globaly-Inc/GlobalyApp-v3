import { httpDelete, httpGet, httpPost } from "@/lib/api/http";
import type {
  AgentRow,
  CampusRow,
  CourseLinks,
  CourseRow,
  CreateJobParams,
  ExtractionJob,
  InstitutionOverview,
  JobFull,
} from "./types";

export const allExtractionsRealApi = {
  getJobs: async (): Promise<ExtractionJob[]> => {
    const { jobs } = await httpGet<{ jobs: ExtractionJob[] }>("/admin/data-extraction/jobs");
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
      httpGet<{ courses: CourseRow[] }>(`/admin/data-extraction/jobs/${id}/courses`),
      httpGet<CourseLinks>(`/admin/data-extraction/jobs/${id}/course-links`),
    ]);
    return {
      job: detail.job,
      overview: detail.overview,
      campuses: campusesRes.campuses,
      agents: agentsRes.agents,
      courses: coursesRes.courses,
      courseLinks,
    };
  },
};
