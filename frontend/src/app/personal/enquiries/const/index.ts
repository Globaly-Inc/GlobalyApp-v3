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

export const STATUS_LABEL: Record<EnquiryStatus, string> = {
  pending: "Pending",
  distributed: "Sent to institutions",
  unlocked: "Unlocked",
  in_conversation: "In conversation",
  converted: "Converted",
  closed: "Closed",
  no_match: "No match found",
  expired: "Expired",
};

/**
 * The badge primitive has no "success" variant, so the positive end of the
 * lifecycle gets explicit colours here (green, as in the v2 reference). Statuses
 * not listed fall back to STATUS_BADGE_VARIANT below.
 */
export const STATUS_BADGE_CLASS: Partial<Record<EnquiryStatus, string>> = {
  unlocked: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  in_conversation: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
};

/** Minimum profile completion required before an enquiry can be sent (v2 parity). */
export const REQUIRED_COMPLETION = 100;

export const STATUS_BADGE_VARIANT: Record<EnquiryStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  distributed: "secondary",
  unlocked: "secondary",
  in_conversation: "default",
  converted: "default",
  closed: "outline",
  no_match: "destructive",
  expired: "destructive",
};
