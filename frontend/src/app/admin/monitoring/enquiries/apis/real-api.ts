import { httpGet } from "@/lib/api/http";
import type { Enquiry } from "./types";

export const enquiriesRealApi = {
  getEnquiries: (): Promise<Enquiry[]> => httpGet("/admin/enquiries"),
};
