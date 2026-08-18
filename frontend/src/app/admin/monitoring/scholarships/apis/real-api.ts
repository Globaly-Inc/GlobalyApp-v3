import { httpGet } from "@/lib/api/http";
import type { Paginated, Scholarship } from "./types";

const BASE = "/admin/monitoring/scholarships";

export const scholarshipsRealApi = {
  getScholarships: async (): Promise<Scholarship[]> =>
    (await httpGet<Paginated<Scholarship>>(`${BASE}?limit=100`)).data,
};
