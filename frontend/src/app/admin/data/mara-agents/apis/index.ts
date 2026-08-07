import { createApi } from "@/lib/api/create-api";
import { maraAgentsMockApi } from "./mock-data";
import { maraAgentsRealApi } from "./real-api";

export const maraAgentsApi = createApi({ mock: maraAgentsMockApi, real: maraAgentsRealApi });
export type { MaraAgentSummary } from "./types";
