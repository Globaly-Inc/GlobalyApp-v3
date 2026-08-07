import { httpGet } from "@/lib/api/http";
import type { KnowledgeByTab } from "./types";

// No V3 backend endpoint for this yet — assumed future contract.
export const aiKnowledgeRealApi = {
  getKnowledge: (): Promise<KnowledgeByTab> => httpGet("/admin/ai-knowledge"),
};
