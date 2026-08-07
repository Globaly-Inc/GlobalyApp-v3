import { httpGet } from "@/lib/api/http";
import type { AgentcisImportBatch } from "./types";

// No V3 backend endpoint for this yet — assumed future contract.
export const agentcisImportRealApi = {
  getBatches: (): Promise<AgentcisImportBatch[]> => httpGet("/admin/data-extraction/agentcis-import"),
};
