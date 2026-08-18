// Wire types for the student-facing enquiry endpoints, mirroring
// backend/src/modules/enquiries/{routes/enquiries.routes.ts,services/enquiries.service.ts}.
//
// Rewritten from a version describing a second enquiries backend that did not
// survive the staging merge. Ids are serial ints, not uuids; there is no per-
// enquiry accept cap (`max_accepts`/`accept_count`) because the cap in this module
// is on fan-out; `extraction_job_id` and `institution_id` are not columns; and
// `closed_at`/`close_reason` live on a business's own distribution row, not on the
// student's enquiry — one business closing a lead is not the student's enquiry
// closing.

/** `enquiries.status` — V1's enquiry_status enum, verbatim, per 20260817_100. */
export const ENQUIRY_STATUSES = [
  "pending",
  "viewed",
  "responded",
  "assigned",
  "converted",
  "closed",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/**
 * Labels joined from superadmin.extraction_courses. All nullable: the enquiry may
 * name no course, and a course can be hard-deleted by the extraction tail's
 * duplicate merge while the enquiry that named it lives on (20260817_961).
 */
export type CourseLabels = {
  course_name: string | null;
  course_short_name: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
};

/** How far the lead travelled. Both counts are computed per read, never stored. */
export type EnquiryReach = {
  /** Businesses this enquiry was distributed to. */
  distributed_to: number;
  /** How many of them paid to see the student's contact details. */
  unlocked_by_count: number;
};

export type EnquiryListItem = CourseLabels &
  EnquiryReach & {
    id: number;
    status: EnquiryStatus;
    message: string;
    preferred_intake: string | null;
    preferred_year: number | null;
    /** superadmin.extraction_courses uuid, when the student picked one. */
    course_id: string | null;
    /** A tenant-schema service uuid — a different concept from course_id. */
    service_id: string | null;
    distributed_at: string | null;
    created_at: string;
  };

export type Enquiry = CourseLabels & {
  id: number;
  student_id: number;
  status: EnquiryStatus;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  course_id: string | null;
  service_id: string | null;
  target_org_type: "business" | "institution" | null;
  target_org_id: number | null;
  agent_business_id: number | null;
  assigned_to: number | null;
  distributed_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  unlocked_by_count: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

/**
 * POST /enquiries answers with the fan-out result, not the enquiry row: creating
 * and distributing are one call, so the useful news is who received it.
 */
export type CreateEnquiryResult = {
  id: number;
  status: EnquiryStatus;
  created_at: string;
  distributed_to: number;
  recipients: Array<{ business_id: number; coin_cost: number; distance_km: number | null }>;
};

/**
 * Exactly the keys the dialog sends. CreateEnquirySchema is `.strict()`, so an
 * extra key is a 400 — this type is the contract, not a superset of it.
 *
 * `course_id` is required here although the server accepts null: every entry point
 * to this dialog (the New Enquiry button and the ?course_id= deep link from
 * /personal/courses) is about a course.
 */
export type CreateEnquiryInput = {
  course_id: string;
  message: string;
  preferred_intake?: string | null;
  preferred_year?: number | null;
};
