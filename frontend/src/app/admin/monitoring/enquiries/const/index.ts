/**
 * The status vocabulary, badge palette and the three lifecycle buckets are the business
 * inbox's — one lifecycle must read identically wherever it is shown, and this screen
 * watches the same rows. `INBOX_FILTERS` partitions every status, so the four pills here
 * (All + the three) cover the whole vocabulary with no gaps.
 */
export { ENQUIRY_STATUS_LABEL, INBOX_FILTERS, type InboxFilterKey } from "@/app/business/enquiries/const";

export const ENQUIRY_TABLE_HEAD = ["Student", "Course", "Status", "Recipients", "Intake", "Created"];

export const DISTRIBUTION_TABLE_HEAD = ["Business", "Tier", "Status", "Coins", "Unlocked"];

/**
 * Why a business was picked, from `rankCandidates` in
 * backend/src/modules/enquiries/services/matching.service.ts. Tier is the single most
 * useful thing on a distribution row: it says whether the match was a strong local one
 * or the bottom of the barrel.
 */
export const TIER_LABEL: Record<number, string> = {
  1: "Verified · under 20km",
  2: "Verified · 20–40km",
  3: "Verified · 40km+ or unknown",
  4: "Unverified rep",
};
