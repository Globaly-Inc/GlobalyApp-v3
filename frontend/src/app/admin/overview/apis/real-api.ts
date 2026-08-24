import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import type { DashboardData, DashboardPreset, SiteAccessSettings } from "./types";

export const overviewRealApi = {
  getDashboard: (preset: DashboardPreset): Promise<DashboardData> =>
    httpGet(`/admin/analytics/dashboard?preset=${preset}`),
  getSiteAccess: (): Promise<SiteAccessSettings> => httpGet("/admin/platform/site-access"),
  updateSiteAccess: (is_locked: boolean): Promise<SiteAccessSettings> =>
    httpPatch("/admin/platform/site-access", { is_locked }),
  regenerateAccessCode: (): Promise<{ access_code: string }> =>
    httpPost("/admin/platform/site-access/regenerate-code", {}),
};
