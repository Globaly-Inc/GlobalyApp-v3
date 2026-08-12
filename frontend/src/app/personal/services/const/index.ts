import type { OrderStatus, ServiceCategory } from "../apis";

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  airport_pickup: "Airport Pickup",
  city_orientation: "City Orientation",
  rental_support: "Rental Support",
  employment_support: "Employment Setup & Support",
  assignment_help: "Assignment Help",
  private_tutoring: "Private Tutoring",
  other: "Other",
};

/**
 * Order status labels.
 *
 * `paid` reads **"Payment held"**, not "In Escrow" — a deliberate departure from the PRD's wording. Escrow
 * names a specific legal and operational arrangement: a segregated account, a defined release trigger, a
 * named custodian. None of that exists here, and the fact that the refund path *is* real does not make the
 * holding arrangement escrow. Promising it in a status badge is a commitment the implementation cannot
 * honour. "Payment held" is true today; this one line becomes "In Escrow" the day the funds-holding model is
 * actually defined. The stored value stays `paid` either way.
 *
 * The word "escrow" appears nowhere in this feature's UI.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Pending Payment",
  paid: "Payment held",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

/** Badge styling per status. Kept as full class strings so Tailwind's scanner can see them. */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  disputed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground/70",
};

/** One-line explanation shown on the order detail, so a status never has to be guessed at. */
export const STATUS_EXPLANATIONS: Record<OrderStatus, string> = {
  pending_payment: "This order has not been paid yet.",
  paid: "The payment is held. This order closes when both parties confirm completion.",
  completed: "Both parties confirmed completion.",
  disputed: "A problem was reported. Our team reviews disputed orders — no further action is available here.",
  refunded: "The payment was returned to the buyer.",
  cancelled: "This order ended before payment.",
};

/** Statuses that accept no action from either party. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ["completed", "refunded", "cancelled"];

export const MAX_COVER_MB = 10;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
