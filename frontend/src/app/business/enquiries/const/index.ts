
/**
 * The full status vocabulary — mirrors chk_business_enquiries_status in
 * backend/database/migrations/business/20260812_001_business_enquiries.ts, which
 * in turn matches chk_enquiries_status. The list endpoint returns the tenant
 * row's status, so these are the values a business can actually receive.
 */
export const ENQUIRY_STATUSES = [
  "pending",
  "distributed",
  "unlocked",
  "in_conversation",
  "converted",
  "closed",
  "no_match",
  "expired",
] as const;

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/**
 * Every status is labelled, including `pending` and `no_match` — a tenant row is only
 * created at distribution time and an enquiry that matched nobody has no tenant row at
 * all, so in practice neither should arrive here. They render correctly if one does.
 */
export const ENQUIRY_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  distributed: "Distributed",
  unlocked: "Unlocked",
  in_conversation: "In Conversation",
  converted: "Converted",
  closed: "Closed",
  no_match: "No Match",
  expired: "Expired",
};

/**
 * Badge styling per status — same shape and palette as the student side's
 * `personal/enquiries/const`, so one lifecycle reads identically on both screens. Full
 * class strings so Tailwind's scanner can see them.
 *
 * Green is reserved for the two statuses that mean something good actually happened.
 */
export const ENQUIRY_STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  distributed: "bg-info/15 text-info",
  unlocked: "bg-success/15 text-success",
  in_conversation: "bg-chart-4/15 text-chart-4",
  converted: "bg-success/15 text-success",
  closed: "bg-muted text-muted-foreground",
  no_match: "bg-muted text-muted-foreground/80",
  expired: "bg-muted text-muted-foreground/80",
};

/** The badge's leading dot — same hue as its text, at full strength so it reads at 6px. */
export const ENQUIRY_STATUS_DOT: Record<string, string> = {
  pending: "bg-warning",
  distributed: "bg-info",
  unlocked: "bg-success",
  in_conversation: "bg-chart-4",
  converted: "bg-success",
  closed: "bg-muted-foreground/50",
  no_match: "bg-muted-foreground/40",
  expired: "bg-muted-foreground/40",
};

export type InboxFilterKey = "new" | "unlocked" | "closed";

/**
 * The three states a lead is actually in from the agent's point of view: not paid for yet,
 * paid for and live, finished. Between them they cover every status, so there is no "All"
 * pill — the three ARE all of them, and one fewer control is one fewer thing to read.
 *
 * `converted` sits under Unlocked rather than Closed: it is the best outcome, not a dead
 * lead, and burying a win with the expiries would read as a loss.
 */
export const INBOX_FILTERS: readonly {
  key: InboxFilterKey;
  label: string;
  statuses: readonly string[];
}[] = [
  { key: "new", label: "New", statuses: ["pending", "distributed"] },
  { key: "unlocked", label: "Unlocked", statuses: ["unlocked", "in_conversation", "converted"] },
  { key: "closed", label: "Closed", statuses: ["closed", "no_match", "expired"] },
];

/** Rows per page in the business inbox. Matches My Enquiries and the other paginated lists. */
export const INBOX_PAGE_SIZE = 10;
