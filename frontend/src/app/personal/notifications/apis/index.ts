// No mock branch on purpose: §1.4 / §8 — a page that has gone live deletes its mock
// path, so this surface only ever talks to the real API. (createApi is still the right
// factory for pages whose backend does not exist yet.)
export { notificationsRealApi as notificationsApi } from "./real-api";
export type {
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationPreferences,
  Paginated,
} from "./types";
