/** Mirrors the backend enquiries module's admin monitoring payloads (Wave D1). */

export type EnquiryStatus = "pending" | "viewed" | "responded" | "assigned" | "converted" | "closed";

/** One row of GET /admin/monitoring/enquiries — an enquiry plus its funnel counters. */
export type AdminEnquiry = {
  id: number;
  status: EnquiryStatus;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  target_org_type: "business" | "institution" | null;
  target_org_id: number | null;
  distributed_at: string | null;
  converted_at: string | null;
  created_at: string;
  student_id: number;
  student_name: string;
  student_email: string;
  /** How many businesses received the lead. */
  distributed_to: number;
  /** How many of them paid to unlock it. */
  unlocked_count: number;
  /** Credits those unlocks brought in. */
  credits_earned: number;
};

export type AdminEnquiryStats = {
  enquiries: { total: number; pending: number; converted: number; last_7_days: number };
  distributions_total: number;
  unlocks: { total: number; credits_spent: number };
  digest_queue: { pending: number; failed: number };
};

export type ListEnquiriesParams = {
  status?: EnquiryStatus;
  student_id?: number;
  business_id?: number;
  page?: number;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
