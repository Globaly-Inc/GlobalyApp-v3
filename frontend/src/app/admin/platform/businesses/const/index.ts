import type { BranchType, BusinessCreateInput, BusinessStatus } from "../apis/types";

export const STATUS_COLORS: Record<BusinessStatus, string> = {
  unverified: "bg-muted text-muted-foreground",
  claim_pending: "bg-amber-100 text-amber-700",
  claimed: "bg-sky-100 text-sky-700",
  verified: "bg-emerald-100 text-emerald-700",
  suspended: "bg-muted text-muted-foreground",
  rejected: "bg-red-100 text-red-700",
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
  { value: "pre-seeded", label: "Pre-seeded" },
  { value: "user-created", label: "User created" },
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
