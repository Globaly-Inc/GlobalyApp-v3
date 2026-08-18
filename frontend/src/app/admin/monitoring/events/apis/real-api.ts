import { httpGet } from "@/lib/api/http";
import type { AdminEvent, AdminEventRegistration, AdminEventStats, Paginated } from "./types";

const BASE = "/admin/events";

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Normalised at the boundary, like every other feature — a partial payload must not throw during render. */
function paginate<T>(raw: Partial<Paginated<T>> | undefined | null): Paginated<T> {
  return {
    data: toArray<T>(raw?.data),
    meta: {
      page: Number(raw?.meta?.page ?? 1),
      limit: Number(raw?.meta?.limit ?? 20),
      total: Number(raw?.meta?.total ?? 0),
      totalPages: Number(raw?.meta?.totalPages ?? 1),
    },
  };
}

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const adminEventsRealApi = {
  getStats: async (): Promise<AdminEventStats> => {
    const raw = await httpGet<Partial<AdminEventStats>>(`${BASE}/stats`);
    return {
      events: {
        total: Number(raw?.events?.total ?? 0),
        published: Number(raw?.events?.published ?? 0),
        draft: Number(raw?.events?.draft ?? 0),
        cancelled: Number(raw?.events?.cancelled ?? 0),
        upcoming: Number(raw?.events?.upcoming ?? 0),
      },
      registrations: {
        total: Number(raw?.registrations?.total ?? 0),
        checked_in: Number(raw?.registrations?.checked_in ?? 0),
        cancelled: Number(raw?.registrations?.cancelled ?? 0),
      },
      tickets: {
        total: Number(raw?.tickets?.total ?? 0),
        seats_claimed: Number(raw?.tickets?.seats_claimed ?? 0),
        gross_paid: Number(raw?.tickets?.gross_paid ?? 0),
      },
    };
  },

  getEvents: async (params: { q?: string; status?: string; event_type?: string; page?: number } = {}) =>
    paginate<AdminEvent>(await httpGet<Partial<Paginated<AdminEvent>>>(`${BASE}${query(params)}`)),

  getRegistrations: async (eventId: number, params: { status?: string; page?: number } = {}) =>
    paginate<AdminEventRegistration>(
      await httpGet<Partial<Paginated<AdminEventRegistration>>>(
        `${BASE}/${eventId}/registrations${query(params)}`,
      ),
    ),
};
