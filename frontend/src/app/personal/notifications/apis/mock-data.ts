import type { UnreadCount } from "./types";

export const notificationsMockApi = {
  getUnreadCount: async (): Promise<UnreadCount> => {
    console.log("[mock] GET /notifications/unread-count");
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { unread: 3 };
  },
};
