// Shared vocabulary for the events module. Mirrors the CHECK constraints in
// database/migrations/globalyapp/20260817_010_events.ts — if you add a value
// here, add it there too (in a NEW migration).

export const EVENT_TYPES = ["in_person", "online", "hybrid"] as const;
export const EVENT_CATEGORIES = ["networking", "workshop", "conference", "open_day", "other"] as const;
export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export const EVENT_VISIBILITIES = ["public", "targeted"] as const;

export const REGISTRATION_STATUSES = ["registered", "checked_in", "cancelled"] as const;
export const PAYMENT_STATUSES = ["free", "pending", "paid", "refunded", "expired"] as const;

export const ORG_TYPES = ["business", "institution"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** How long a paid checkout holds its seats before the lazy reaper can release them. */
export const CHECKOUT_HOLD_MINUTES = 30;

/** Cap on quantity per checkout, matching V1's create-event-payment. */
export const MAX_TICKETS_PER_ORDER = 20;

/** Notification types this module publishes. */
export const EVENT_NOTIFICATION_TYPES = {
  registered: "event_registration_confirmed",
  update: "event_update_posted",
  cancelled: "event_cancelled",
} as const;
