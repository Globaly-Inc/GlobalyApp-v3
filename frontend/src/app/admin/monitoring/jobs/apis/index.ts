import { createApi } from "@/lib/api/create-api";
import { adminJobsMockApi } from "./mock-data";
import { adminJobsRealApi } from "./real-api";

export const adminJobsApi = createApi({ mock: adminJobsMockApi, real: adminJobsRealApi });
export type { AdminJob, AdminJobStats, JobStatus, ListJobsParams } from "./types";
