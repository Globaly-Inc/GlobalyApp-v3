import { createApi } from "@/lib/api/create-api";
import { adminMockApi } from "./mock-data";
import { adminRealApi } from "./real-api";

export const adminApi = createApi({ mock: adminMockApi, real: adminRealApi });
export type { AdminUser, AdminRole } from "./types";
