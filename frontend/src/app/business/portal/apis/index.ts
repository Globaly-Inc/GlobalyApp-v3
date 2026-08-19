import { createApi } from "@/lib/api/create-api";
import { businessDashboardMockApi } from "./mock-data";
import { businessDashboardRealApi } from "./real-api";

export const businessDashboardApi = createApi({
  mock: businessDashboardMockApi,
  real: businessDashboardRealApi,
});
export type { BusinessDashboard, DashboardBusiness, DashboardMember, InboxItem } from "./types";
