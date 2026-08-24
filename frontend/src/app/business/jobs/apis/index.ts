import { createApi } from "@/lib/api/create-api";
import { businessJobsMockApi } from "./mock-data";
import { businessJobsRealApi } from "./real-api";

export const businessJobsApi = createApi({ mock: businessJobsMockApi, real: businessJobsRealApi });
export type { Application, ApplicationStatus, CreateJobInput, Job, JobType, UpdateJobInput } from "./types";
