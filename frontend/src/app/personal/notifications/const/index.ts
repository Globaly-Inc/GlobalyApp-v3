import type { NotificationChannel } from "../apis";

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In app",
  email: "Email",
  push: "Push",
};

/**
 * Absence of a preference row means the server default applies — mirror
 * backend/src/modules/notifications/consts.ts DEFAULT_CHANNEL_ENABLED here so an
 * unset switch renders in the state the fan-out will actually use.
 */
export const CHANNEL_DEFAULTS: Record<NotificationChannel, boolean> = {
  in_app: true,
  email: true,
  push: false,
};
