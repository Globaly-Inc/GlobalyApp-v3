import { httpGet, httpPost } from "@/lib/api/http";
import type {
  PromoteResult,
  VerticalRowsResponse,
  VerticalReviewStatus,
  VerticalSlug,
  VerticalSummary,
} from "./types";

export const serviceVerticalsRealApi = {
  listVerticals: async (): Promise<VerticalSummary[]> => {
    const { verticals } = await httpGet<{ verticals: VerticalSummary[] }>(
      `/admin/data-extraction/service-verticals`,
    );
    return verticals;
  },

  listRows: async (
    slug: VerticalSlug,
    status?: VerticalReviewStatus,
  ): Promise<VerticalRowsResponse> => {
    const qs = status ? `?status=${status}&limit=100` : "?limit=100";
    return httpGet<VerticalRowsResponse>(`/admin/data-extraction/service-verticals/${slug}${qs}`);
  },

  discardRow: async (slug: VerticalSlug, id: string): Promise<void> => {
    await httpPost(`/admin/data-extraction/service-verticals/${slug}/${id}/discard`, {});
  },

  // The target is an org id, and V3 org ids are serial integers. A scraped
  // provider nobody has claimed is an `institution`, which is why that is the
  // default on both sides of the wire.
  promoteRow: async (
    slug: VerticalSlug,
    id: string,
    targetOrgId: number,
    targetOrgType: "business" | "institution" = "institution",
  ): Promise<PromoteResult> => {
    return httpPost<PromoteResult>(
      `/admin/data-extraction/service-verticals/${slug}/${id}/promote`,
      { target_org_type: targetOrgType, target_org_id: targetOrgId },
    );
  },
};
