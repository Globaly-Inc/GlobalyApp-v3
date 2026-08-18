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

  // The target is an org id, and V3 org ids are serial integers — V1/V2 passed a
  // uuid here. `department_business_id` keeps its name for the existing UI; the
  // backend also accepts target_org_type/target_org_id for institution targets,
  // which is what a scraped immigration department normally is.
  promoteVisa: async (id: string, departmentOrgId: number): Promise<void> => {
    await httpPost(`/admin/data-extraction/visas/${id}/promote`, {
      target_org_type: "institution",
      target_org_id: departmentOrgId,
    });
  },

  // 503 until the extractor is wired up (§3.8). The payload is the real contract
  // now — it used to send { urls } to a schema that demanded { source_url }, so
  // every launch 400'd and the fail-closed 503 was unreachable.
  launchExtraction: async (urls: string[]): Promise<void> => {
    await httpPost(`/admin/data-extraction/visas/extract`, { urls });
  },
};
