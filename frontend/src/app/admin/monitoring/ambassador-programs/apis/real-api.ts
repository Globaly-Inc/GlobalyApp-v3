import { httpGet } from "@/lib/api/http";
import type {
  AdminAmbassadorProgram,
  AdminAmbassadorStats,
  ListAmbassadorProgramsParams,
  Paginated,
} from "./types";

const BASE = "/admin/monitoring/ambassador-programs";

function toQuery(params: ListAmbassadorProgramsParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Normalized at the boundary, like every other feature — a partial payload must not throw during render. */
function paginate<T>(raw: Partial<Paginated<T>> | undefined | null): Paginated<T> {
  return {
    data: Array.isArray(raw?.data) ? (raw.data as T[]) : [],
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
  };
}

export const ambassadorProgramsRealApi = {
  getPrograms: async (
    params: ListAmbassadorProgramsParams = {},
  ): Promise<Paginated<AdminAmbassadorProgram>> =>
    paginate<AdminAmbassadorProgram>(
      await httpGet<Partial<Paginated<AdminAmbassadorProgram>>>(`${BASE}${toQuery(params)}`),
    ),

  getStats: async (): Promise<AdminAmbassadorStats> => {
    const raw = await httpGet<Partial<AdminAmbassadorStats>>(`${BASE}/stats`);
    return {
      programs: {
        total: Number(raw?.programs?.total ?? 0),
        active: Number(raw?.programs?.active ?? 0),
      },
      ambassadors: {
        total: Number(raw?.ambassadors?.total ?? 0),
        active: Number(raw?.ambassadors?.active ?? 0),
      },
      inquiries: {
        total: Number(raw?.inquiries?.total ?? 0),
        resolved: Number(raw?.inquiries?.resolved ?? 0),
        last_7_days: Number(raw?.inquiries?.last_7_days ?? 0),
        escalated: Number(raw?.inquiries?.escalated ?? 0),
      },
      payouts: {
        total: Number(raw?.payouts?.total ?? 0),
        paid_minor: Number(raw?.payouts?.paid_minor ?? 0),
        failed: Number(raw?.payouts?.failed ?? 0),
      },
    };
  },
};
