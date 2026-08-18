import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

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
 * Which statuses get a summary card. `pending` and `no_match` are deliberately
 * excluded: a tenant row is only ever created at distribution time, and an
 * enquiry that matched nobody has no tenant row at all — so both could only ever
 * count zero. Badges still render them correctly if one somehow appears.
 */
export const ENQUIRY_STAT_STATUSES = [
  "distributed",
  "unlocked",
  "in_conversation",
  "converted",
  "closed",
  "expired",
] as const satisfies readonly EnquiryStatus[];

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

export const ENQUIRY_STATUS_BADGE_VARIANT: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  pending: "outline",
  distributed: "default",
  unlocked: "secondary",
  in_conversation: "secondary",
  converted: "default",
  closed: "outline",
  no_match: "destructive",
  expired: "destructive",
};
