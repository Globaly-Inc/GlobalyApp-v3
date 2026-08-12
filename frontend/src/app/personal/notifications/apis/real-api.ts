import { httpGet } from "@/lib/api/http";
import type { UnreadCount } from "./types";

export const notificationsRealApi = {
  getUnreadCount: (): Promise<UnreadCount> => httpGet("/notifications/unread-count"),
};
