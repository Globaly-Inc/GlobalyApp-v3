import { createApi } from "@/lib/api/create-api";
import { logsMockApi } from "./mock-data";
import { logsRealApi } from "./real-api";

export const logsApi = createApi({ mock: logsMockApi, real: logsRealApi });
export type { AuditLogEntry } from "./types";
