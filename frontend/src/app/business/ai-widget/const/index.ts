import type { VisitorStatus, VisitorStatusFilter } from "../apis/types";

/** The three tabs, in the order the brief asks for them. Counts are filled in from the API. */
export const VISITOR_TABS: readonly { value: VisitorStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "visitor", label: "Visitors" },
  { value: "lead", label: "Leads" },
];

/**
 * Badge styling per status. A lead is the outcome the widget exists for, so it gets the one
 * coloured badge on the row; a visitor stays muted rather than competing with it.
 */
export const VISITOR_STATUS_BADGE: Record<VisitorStatus, { label: string; className: string }> = {
  lead: { label: "Lead", className: "bg-emerald-100 text-emerald-700 border-0" },
  visitor: { label: "Visitor", className: "bg-muted text-muted-foreground border-0" },
};

/** What the widget did about this person's details, in words an owner can act on. */
export const CONTACT_STATUS_LABELS: Record<string, string> = {
  not_shown: "Not asked yet",
  shown: "Asked, no answer yet",
  skipped: "Declined to share",
  submitted: "Shared their details",
};

export const CONVERSATION_STATE_LABELS: Record<string, string> = {
  active: "In progress",
  ending_prompt_shown: "Offered a wrap-up",
  continue: "Chose to keep going",
  end_confirmed: "Ended by the visitor",
};

/** The summary email owed to anyone who left an address. Null means none is owed. */
export const SUMMARY_STATUS_LABELS: Record<string, string> = {
  pending: "Summary owed",
  processing: "Summary sending",
  sent: "Summary sent",
  failed: "Summary failed",
};

/** The four jsonb columns, with the heading each gets in the detail drawer. */
export const VISITOR_PROFILE_SECTIONS = [
  { key: "qualifications", label: "Qualifications" },
  { key: "work_experiences", label: "Work experience" },
  { key: "language_tests", label: "Language tests" },
  { key: "academic_tests", label: "Academic tests" },
] as const;

export const VISITORS_PAGE_SIZE = 10;
