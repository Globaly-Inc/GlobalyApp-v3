import { httpGet } from "@/lib/api/http";
import type { Scholarship } from "./types";

export const scholarshipsRealApi = {
  getScholarships: (): Promise<Scholarship[]> => httpGet("/admin/scholarships"),
};
