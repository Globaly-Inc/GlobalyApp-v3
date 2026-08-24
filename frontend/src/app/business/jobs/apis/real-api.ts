import { httpDelete, httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { Application, ApplicationStatus, CreateJobInput, Job, UpdateJobInput } from "./types";

export const businessJobsRealApi = {
  listJobs: (): Promise<Job[]> => httpGet("/jobs/jobs"),

  createJob: (input: CreateJobInput): Promise<Job> => httpPost("/jobs/jobs", input),

  updateJob: (jobId: number, input: UpdateJobInput): Promise<Job> => httpPatch(`/jobs/jobs/${jobId}`, input),

  deleteJob: (jobId: number): Promise<void> => httpDelete(`/jobs/jobs/${jobId}`),

  listApplications: (jobId: number): Promise<Application[]> => httpGet(`/jobs/jobs/${jobId}/applications`),

  reviewApplication: (jobId: number, applicationId: number, status: ApplicationStatus): Promise<Application> =>
    httpPost(`/jobs/jobs/${jobId}/applications/${applicationId}/review`, { status }),
};
