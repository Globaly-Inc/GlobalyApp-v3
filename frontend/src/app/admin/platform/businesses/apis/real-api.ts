import { httpGet } from "@/lib/api/http";
import type { BusinessSummary } from "./types";

export const businessesRealApi = {
  getBusinesses: (): Promise<BusinessSummary[]> => httpGet("/admin/businesses"),
};
