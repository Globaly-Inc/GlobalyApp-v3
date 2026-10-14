import type { BranchType, BusinessCreateInput, BusinessStatus } from "../apis/types";

/** Badge variant per listing status (`ui/badge`). */
export const STATUS_VARIANT: Record<BusinessStatus, "secondary" | "warning" | "info" | "success" | "destructive"> = {
  unverified: "secondary",
  claim_pending: "warning",
  claimed: "info",
  verified: "success",
  suspended: "secondary",
  rejected: "destructive",
};

export const STATUS_LABELS: Record<BusinessStatus, string> = {
  unverified: "Unverified",
  claim_pending: "Claim Pending",
  claimed: "Claimed",
  verified: "Verified",
  suspended: "Suspended",
  rejected: "Rejected",
};

export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unverified", label: "Unverified" },
  { value: "claim_pending", label: "Claim Pending" },
  { value: "claimed", label: "Claimed" },
  { value: "verified", label: "Verified" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

export const SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "seeded", label: "Seeded" },
  { value: "admin", label: "Admin-added" },
  { value: "signup", label: "Sign-up" },
  { value: "spreadsheet", label: "Spreadsheet import" },
  { value: "agentcis", label: "AgentCIS import" },
];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "name_asc", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "created_desc", label: "Created (newest)" },
  { value: "created_asc", label: "Created (oldest)" },
];

export const OWNERSHIP_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All ownership" },
  { value: "owned", label: "Owned" },
  { value: "unclaimed", label: "Unclaimed" },
];

export const BRANCH_TYPES: { value: BranchType; label: string }[] = [
  { value: "same_company", label: "Same Company" },
  { value: "subsidiary", label: "Subsidiary" },
  { value: "franchise", label: "Franchise" },
];

export const BRANCH_TYPE_OPTIONS: { value: BranchType; label: string; desc: string }[] = [
  { value: "same_company", label: "Same Company", desc: "Another office of the same registered company" },
  { value: "subsidiary", label: "Subsidiary Company", desc: "A separate company owned or controlled by your business" },
  { value: "franchise", label: "Franchise", desc: "An independently owned business operating under your brand" },
];

export const URL_FIELDS: Array<[keyof BusinessCreateInput, string]> = [
  ["website", "website"],
  ["linkedin_url", "LinkedIn"],
  ["facebook_url", "Facebook"],
  ["instagram_url", "Instagram"],
  ["twitter_url", "Twitter/X"],
  ["logo_url", "logo"],
  ["cover_url", "cover image"],
];
