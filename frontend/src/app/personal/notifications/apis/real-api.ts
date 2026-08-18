import { httpDelete, httpGet, httpPostNoContent, httpPost, httpPut } from "@/lib/api/http";
import type {
  Notification,
  NotificationChannel,
  NotificationPreferences,
  Paginated,
} from "./types";

const BASE = "/notifications";

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Normalised at the boundary — a partial payload must not throw during render. */
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

export const notificationsRealApi = {
  list: async (params: { unread?: boolean; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.unread) qs.set("unread", "true");
    if (params.page) qs.set("page", String(params.page));
    const query = qs.toString();
    return paginate<Notification>(
      await httpGet<Partial<Paginated<Notification>>>(`${BASE}${query ? `?${query}` : ""}`),
    );
  },

  unreadCount: async (): Promise<number> => {
    const raw = await httpGet<{ unread?: number }>(`${BASE}/unread-count`);
    return Number(raw?.unread ?? 0);
  },

  markRead: (id: number) => httpPostNoContent(`${BASE}/${id}/read`),

  markAllRead: async (): Promise<number> => {
    const raw = await httpPost<{ updated?: number }>(`${BASE}/read-all`, {});
    return Number(raw?.updated ?? 0);
  },

  remove: (id: number) => httpDelete(`${BASE}/${id}`),

  getPreferences: async (): Promise<NotificationPreferences> => {
    const raw = await httpGet<Partial<NotificationPreferences>>(`${BASE}/preferences`);
    return {
      channels: toArray<NotificationChannel>(raw?.channels),
      preferences: toArray<NotificationPreferences["preferences"][number]>(raw?.preferences),
    };
  },

  setPreferences: async (
    preferences: Array<{ notification_type: string; channel: NotificationChannel; enabled: boolean }>,
  ): Promise<NotificationPreferences> => {
    const raw = await httpPut<Partial<NotificationPreferences>>(`${BASE}/preferences`, { preferences });
    return {
      channels: toArray<NotificationChannel>(raw?.channels),
      preferences: toArray<NotificationPreferences["preferences"][number]>(raw?.preferences),
    };
  },
};
