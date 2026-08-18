// Wire types for the business enquiry inbox, mirroring
// backend/src/modules/enquiries/services/enquiries.service.ts `toInboxItem`.
//
// This file was originally written against a second, since-removed enquiries
// backend that served the same feature at /enquiry-distributions with uuid ids,
// tier/match_rank ranking, a per-enquiry unlock cap and joined course names. The
// D1 module that survived the merge has none of those: ids are serial ints,
// matching is by great-circle distance, the cap is on fan-out rather than on
// unlocks, and an enquiry references a tenant service uuid, not a catalog course.
// Every field below exists on the wire — nothing here is aspirational.

/** `enquiry_distributions.status` — the CHECK in 20260817_100_enquiries.ts. */
export const DISTRIBUTION_STATUSES = ["pending", "viewed", "responded", "closed"] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

/** Fields that exist whether or not the lead has been paid for. */
export type InboxItemShared = {
  /** enquiry_distributions.id — this business's own copy of the lead. */
  id: number;
  enquiry_id: number;
  status: DistributionStatus;
  /** The parent enquiry's status, which the student's own actions also move. */
  enquiry_status: string;
  /** Credits this row costs to unlock, frozen when it was distributed. */
  coin_cost: number;
  /** Great-circle km from the student. Null when either side has no coordinates. */
  distance_km: number | null;
  preferred_intake: string | null;
  preferred_year: number | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
};

/**
 * A lead that has not been paid for.
 *
 * The server does not send the contact fields as nulls — it omits the KEYS, so
 * `student` here genuinely has two properties and no amount of client code can
 * read an email off it. Keeping that as a discriminated union rather than one
 * all-nullable type makes the paywall a compile error instead of a convention.
 */
export type LockedInboxItem = InboxItemShared & {
  unlocked: false;
  /** First 140 characters, truncated server-side. */
  message_preview: string;
  student: { first_name: string; photo_url: string | null };
};

export type UnlockedInboxItem = InboxItemShared & {
  unlocked: true;
  unlocked_at: string;
  credits_spent: number;
  message: string;
  /** A service uuid inside the target org's tenant schema, when the enquiry named one. */
  service_id: string | null;
  student: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    photo_url: string | null;
    city_of_residence: string | null;
    nationality_id: number | null;
    country_of_residence_id: number | null;
  };
};

export type InboxItem = LockedInboxItem | UnlockedInboxItem;

export type PaginatedResponse<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type CreditBalance = {
  balance: number;
  /** What the next lead will cost this business, priced the way the distributor prices it. */
  unlock_cost: number;
};

/** POST :id/unlock. Returns the whole re-masked row, so callers replace rather than patch. */
export type UnlockResult = {
  unlocked: true;
  already_unlocked: boolean;
  credits_spent: number;
  /** Wallet balance after the debit. */
  balance: number;
  enquiry: InboxItem;
};

/** POST :id/close. Distribution columns only — closing never reveals the lead. */
export type CloseResult = {
  id: number;
  status: DistributionStatus;
  already_closed: boolean;
  closed_at: string | null;
  close_reason: string | null;
};
