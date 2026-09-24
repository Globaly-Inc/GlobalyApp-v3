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
 * Badge styling per status, in the same shape as `personal/earn/services/const` —
 * full class strings so Tailwind's scanner can see them, and one flat record so a
 * new status can't be added with a label but no colour.
 *
 * Green is reserved for the two statuses that mean something good actually happened
 * (a business paid to unlock, or the enquiry converted); everything else is a mood,
 * not an outcome.
 */
export const STATUS_STYLES: Record<EnquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  distributed: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  unlocked: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  in_conversation: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  converted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  no_match: "bg-muted text-muted-foreground/80",
  expired: "bg-muted text-muted-foreground/80",
};

/** The badge's leading dot — same hue as its text, at full strength so it reads at 6px. */
export const STATUS_DOT: Record<EnquiryStatus, string> = {
  pending: "bg-amber-500",
  distributed: "bg-blue-500",
  unlocked: "bg-emerald-500",
  in_conversation: "bg-indigo-500",
  converted: "bg-emerald-500",
  closed: "bg-muted-foreground/50",
  no_match: "bg-muted-foreground/40",
  expired: "bg-muted-foreground/40",
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
