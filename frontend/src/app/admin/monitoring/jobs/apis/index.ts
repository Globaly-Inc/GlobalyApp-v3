import { createApi } from "@/lib/api/create-api";
import { jobsMockApi } from "./mock-data";
import { jobsRealApi } from "./real-api";

export const jobsApi = createApi({ mock: jobsMockApi, real: jobsRealApi });
export type { JobPosting } from "./types";
