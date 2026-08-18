import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import { DISTRIBUTION_STATUSES } from "../apis/types";

/**
 * Summary counters, one per status a business can actually receive.
 *
 * The vocabulary is the four values in `chk_enquiry_distributions_status`
 * (backend/database/migrations/globalyapp/20260817_100_enquiries.ts), carried
 * verbatim from V1. This file previously held eight values mirroring a tenant-side
 * `business_enquiries` table that belonged to a second enquiries backend removed
 * in the staging merge; six of them (distributed, unlocked, in_conversation,
 * converted, no_match, expired) can never arrive on this wire.
 *
 * All four are reachable: a distribution starts 'pending', unlock moves it to
 * 'viewed', close moves it to 'closed'. No code path writes 'responded' yet, but
 * it is in the CHECK and can arrive from a data load, so it counts rather than
 * silently vanishing from the totals.
 */
export const ENQUIRY_STAT_STATUSES = DISTRIBUTION_STATUSES;

// 'viewed' is deliberately not labelled "Unlocked": a lead can be unlocked and
// then closed, so the status and the paywall state are two different facts. The
// card renders the paywall state itself.
export const ENQUIRY_STATUS_LABEL: Record<string, string> = {
  pending: "New",
  viewed: "Viewed",
  responded: "Responded",
  closed: "Closed",
};

export const ENQUIRY_STATUS_BADGE_VARIANT: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  pending: "default",
  viewed: "secondary",
  responded: "secondary",
  closed: "outline",
};
