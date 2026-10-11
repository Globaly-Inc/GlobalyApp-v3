import { BadgeCheck, CircleSlash, Clock, Hourglass, MessagesSquare, SearchX, Send, Trophy } from "lucide-react";

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

/** Message bounds, shared by the form's zod schema and its character counter so the
 * limit the student sees is the limit that's enforced. Mirrors the backend schema. */
export const MESSAGE_MAX = 5000;

/** Minimum profile completion required before an enquiry can be sent (v2 parity). */
export const REQUIRED_COMPLETION = 100;

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
 * Badge variant per status, in the same shape as `personal/earn/services/const` — one flat
 * record so a new status can't be added with a label but no colour.
 *
 * Green is reserved for the two statuses that mean something good actually happened
 * (a business paid to unlock, or the enquiry converted); everything else is a mood,
 * not an outcome.
 */
export const STATUS_VARIANT: Record<EnquiryStatus, "secondary" | "outline" | "warning" | "info" | "success"> = {
  pending: "warning",
  distributed: "info",
  unlocked: "success",
  in_conversation: "info",
  converted: "success",
  closed: "secondary",
  no_match: "outline",
  expired: "outline",
};

export const STATUS_ICON: Record<EnquiryStatus, typeof Clock> = {
  pending: Hourglass,
  distributed: Send,
  unlocked: BadgeCheck,
  in_conversation: MessagesSquare,
  converted: Trophy,
  closed: CircleSlash,
  no_match: SearchX,
  expired: Clock,
};

/**
 * One line telling the student what this status means for them, shown on the detail
 * page — same idea as `STATUS_EXPLANATIONS` in the services feature, so a status
 * never has to be guessed at. Says only what is true: nothing here promises a reply.
 */
export const STATUS_EXPLANATIONS: Record<EnquiryStatus, string> = {
  pending: "We're matching your enquiry with institutions and agents. Nothing to do yet.",
  distributed: "Your enquiry has reached matching institutions and agents. You'll be notified if one unlocks it.",
  unlocked: "A business paid to see your details. Start the conversation below.",
  in_conversation: "You're talking to a business about this course. Continue in Messages.",
  converted: "This enquiry turned into an application.",
  closed: "This enquiry is closed. Send a new one if you still need answers.",
  no_match: "No institution or agent matched this course. Try a different course or intake.",
  expired: "This enquiry expired before anyone unlocked it. Send a new one to try again.",
};

/**
 * List filters. Grouped by what the student cares about — still moving, won, or
 * finished — rather than one pill per status, which would put eight tabs above a
 * list of three rows.
 */
export type StatusFilterKey = "all" | "active" | "converted" | "closed";

/** `statuses: null` is the "All" pill — no filtering, not an empty set. */
export const STATUS_FILTERS: readonly {
  key: StatusFilterKey;
  label: string;
  statuses: readonly EnquiryStatus[] | null;
}[] = [
  { key: "all", label: "All", statuses: null },
  { key: "active", label: "In progress", statuses: ["pending", "distributed", "unlocked", "in_conversation"] },
  { key: "converted", label: "Converted", statuses: ["converted"] },
  { key: "closed", label: "Closed", statuses: ["closed", "no_match", "expired"] },
];

/** Rows per page in My Enquiries. Matches the other paginated lists in the app. */
export const ENQUIRIES_PAGE_SIZE = 10;
