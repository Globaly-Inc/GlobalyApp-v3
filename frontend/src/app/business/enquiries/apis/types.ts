// Wire types for GET /api/v3/enquiry-distributions (business inbox, list-only,
// tenant-scoped). Matches backend/src/modules/enquiries/schemas/distributions.schema.ts.
export type DistributionListItem = {
  enquiry_id: string;
  distribution_id: string;
  status: string;
  tier: number | null;
  match_rank: number | null;
  message: string | null;
  /** True when `message` is only a teaser because the row is not unlocked yet. */
  message_truncated: boolean;
  preferred_intake: string | null;
  preferred_year: number | null;
  course_name: string | null;
  course_short_name: string | null;
  institution_name: string | null;
  created_at: string;

  /** How many businesses have unlocked this enquiry, and the cap — rendered as
   * "1/3 unlocked". Column names stay accept_* to match the schema. */
  accept_count: number;
  max_accepts: number;

  /** The student's eligibility rollup for the course they enquired about, as it stood when they
   * sent it. The criteria behind it are deliberately not sent — they name the student's degree
   * and scores. Null on enquiries that predate the eligibility check. */
  eligibility_status: "eligible" | "not_eligible" | "unknown" | null;

  is_unlocked: boolean;
  coin_cost: number;
  unlocked_at: string | null;
  closed_at: string | null;
  close_reason: string | null;

  // Server sends these as null until the row is unlocked.
  student_name: string | null;
  student_email: string | null;
  student_phone: string | null;
};

export type CreditBalance = {
  balance: number;
  unlock_cost: number;
};

export type UnlockResult = {
  distribution_id: string;
  status: string;
  already_unlocked: boolean;
  coin_cost: number;
  credits_remaining: number;
  student_first_name: string | null;
  student_last_name: string | null;
  student_email: string | null;
  student_phone: string | null;
};

export type CloseResult = {
  distribution_id: string;
  status: string;
  close_reason: string | null;
  closed_at: string | null;
};

/** One chat message. Mirrors the student side's shape — same server DTO. */
export type EnquiryMessage = {
  id: number;
  body: string;
  created_at: string;
  sender_id: number;
  sender_name: string;
  /** Signed URL for the sender's profile photo; null when they have none. */
  sender_avatar: string | null;
  is_mine: boolean;
  sender_role: "student" | "business";
};
