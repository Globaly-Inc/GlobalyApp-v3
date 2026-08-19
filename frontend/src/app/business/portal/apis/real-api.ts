import { httpGet } from "@/lib/api/http";
import type { BusinessDashboard } from "./types";

export const businessDashboardRealApi = {
  // One request, not four: the stat cards are counts, and fetching a page of
  // services to read `meta.total` off the envelope is three quarters of a
  // wasted query. Backend: businesses/routes/dashboard.routes.ts.
  getDashboard: (): Promise<BusinessDashboard> => httpGet("/businesses/dashboard"),
};
