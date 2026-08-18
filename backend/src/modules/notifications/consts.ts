// Notification vocabulary. Mirrors the CHECK constraints in
// database/migrations/globalyapp/20260817_013_notifications.ts.

export const CHANNELS = ["in_app", "email", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

export const DELIVERY_STATUSES = ["pending", "sent", "skipped", "failed"] as const;

/** The LavinMQ queue the fan-out worker consumes. */
export const NOTIFICATION_QUEUE = "notifications";

/**
 * What a user gets when they have expressed no preference. Push is opt-in
 * because a device token has to be registered first anyway (V2 treated web push
 * the same way).
 */
export const DEFAULT_CHANNEL_ENABLED: Record<Channel, boolean> = {
  in_app: true,
  email: true,
  push: false,
};

/**
 * in_app is not a transport — the row in `notifications` IS the delivery, so it
 * is marked sent the moment it is written. The others need a provider.
 */
export const IN_APP_IS_TERMINAL = true;
