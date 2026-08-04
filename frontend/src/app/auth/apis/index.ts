import { createApi } from "@/lib/api/create-api";
import { authMockApi } from "./mock-data";
import { authRealApi } from "./real-api";

export const authApi = createApi({ mock: authMockApi, real: authRealApi });
export type { Employee } from "./types";
