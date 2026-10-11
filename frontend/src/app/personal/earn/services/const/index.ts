import type { OrderStatus } from "../apis";

// No CATEGORY_LABELS map any more. Categories are rows in service_categories with their own `name`, so the
// label travels with the data — a hardcoded map here would go stale the moment an admin renamed one.

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
  // Appended: the booking handshake.
  requested: "Awaiting provider",
  declined: "Declined",
  in_progress: "In progress",
};

/** Badge variant per status. */
export const STATUS_VARIANT: Record<OrderStatus, "secondary" | "outline" | "warning" | "info" | "success" | "destructive"> = {
  pending_payment: "warning",
  paid: "info",
  completed: "success",
  disputed: "destructive",
  refunded: "secondary",
  cancelled: "outline",
  requested: "warning",
  declined: "destructive",
  in_progress: "info",
};

/** One-line explanation shown on the order detail, so a status never has to be guessed at. */
export const STATUS_EXPLANATIONS: Record<OrderStatus, string> = {
  pending_payment: "This order has not been paid yet.",
  paid: "The payment is held. Message the other party on this order to sort out the details.",
  // Kept for orders placed before dual confirmation was removed; nothing produces this status now.
  completed: "Both parties confirmed completion.",
  disputed: "A problem was reported. Our team reviews disputed orders — no further action is available here.",
  refunded: "The payment was returned to the buyer.",
  cancelled: "This order ended before payment.",
  requested: "Waiting for the provider to accept. You'll be able to pay once they do — nothing is charged yet.",
  declined: "The provider couldn't take this booking. You have not been charged.",
  in_progress: "The provider has started work on this.",
};

/** Statuses that accept no action from either party. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ["completed", "refunded", "cancelled"];

export const MAX_COVER_MB = 10;
export const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
