import { createApi } from "@/lib/api/create-api";
import { agentcisImportMockApi } from "./mock-data";
import { agentcisImportRealApi } from "./real-api";

export const agentcisImportApi = createApi({ mock: agentcisImportMockApi, real: agentcisImportRealApi });
export type { AgentCISResult, ImportResult } from "./types";
