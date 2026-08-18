import type { EnquiryStatus } from "../apis/types";

export const INTAKE_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Intakes are planned ahead, so the form starts on next year. */
export function defaultIntakeYear(): number {
  return new Date().getFullYear() + 1;
}

/** Current year through +5 — far enough for deferred intakes, short enough to scan. */
export const INTAKE_YEAR_RANGE = 6;

/**
 * The six values in `enquiries_status_check` — V1's enquiry_status enum verbatim.
 *
 * These labels are written from the student's side of the transaction: 'viewed'
 * means a business paid to unlock the lead, which to the student is "someone is
 * looking at it". The eight-value vocabulary this replaces (distributed,
 * unlocked, in_conversation, no_match, expired…) belonged to a second enquiries
 * backend removed in the staging merge and can never arrive on this wire.
 */
export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  pending: "Sent",
  viewed: "Viewed by an agent",
  responded: "Replied",
  assigned: "With a counsellor",
  converted: "Converted",
  closed: "Closed",
};

/**
 * The badge primitive has no "success" variant, so the positive end of the
 * lifecycle gets explicit colours here (green, as in the v2 reference). Statuses
 * not listed fall back to STATUS_BADGE_VARIANT below.
 */
export const STATUS_BADGE_CLASS: Partial<Record<EnquiryStatus, string>> = {
  viewed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  responded: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
};

/** Minimum profile completion required before an enquiry can be sent (v2 parity). */
export const REQUIRED_COMPLETION = 100;

export const STATUS_BADGE_VARIANT: Record<EnquiryStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  viewed: "secondary",
  responded: "default",
  assigned: "secondary",
  converted: "default",
  closed: "outline",
};
