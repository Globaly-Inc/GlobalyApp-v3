import { httpGet, httpPost } from "@/lib/api/http";
import type { VisaExtraction, VisaExtractionStatus } from "./types";

export const visasRealApi = {
  listVisas: async (status?: VisaExtractionStatus): Promise<VisaExtraction[]> => {
    const qs = status && status !== ("all" as string) ? `?status=${status}&limit=100` : "?limit=100";
    const { visas } = await httpGet<{ visas: VisaExtraction[] }>(`/admin/data-extraction/visas${qs}`);
    return visas;
  },

  discardVisa: async (id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/visas/${id}/discard`, {});
  },

  promoteVisa: async (id: string, departmentBusinessId: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/visas/${id}/promote`, { department_business_id: departmentBusinessId });
  },

  // ponytail: backend returns 503 for now, caller handles with toast
  launchExtraction: async (urls: string[]): Promise<void> => {
    await httpPost(`/admin/data-extraction/visas/extract`, { urls });
  },
};
