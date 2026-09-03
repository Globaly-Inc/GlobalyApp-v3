import type {
  AcademicTest,
  LanguageTest,
  Qualification,
  StudentProfile,
  WorkExperience,
} from "@/app/personal/apis/types";

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
   * sent it. Null on enquiries that predate the eligibility check. */
  eligibility_status: "eligible" | "not_eligible" | "unknown" | null;

  /** The criteria behind the rollup — they name the student's degree and scores, so the server
   * sends them only once this row is unlocked. */
  eligibility_criteria: EligibilityCriterion[] | null;

  is_unlocked: boolean;
  coin_cost: number;
  unlocked_at: string | null;
  closed_at: string | null;
  close_reason: string | null;

  /** Visible before unlock — enough to address someone without identifying them. */
  student_first_name: string | null;
  /** Signed avatar URL, unlocked only — a face identifies someone as surely as a surname does. */
  student_photo_url: string | null;
  /** Full name, unlocked only. The surname is withheld from the payload rather than blurred in
   *  the UI: a CSS blur still ships the real value to the browser. */
  student_name: string | null;

  // Server sends these as null until the row is unlocked.
  student_email: string | null;
  /** Also requires the student to have opted in at submission — unlocking alone does not buy it. */
  student_phone: string | null;
  /** Unlocked, but the student declined to share their number. Distinguishes "withheld" from
   *  "they never gave us one", which would otherwise look identical. */
  student_phone_withheld: boolean;
};

/** One line of the eligibility verdict — mirrors the backend's EligibilityCriterion verbatim. */
export type EligibilityCriterion = {
  key: "min_degree" | "min_score" | "academic_test" | "language_test";
  label: string;
  /** What the course asks for, formatted for display. */
  required: string | null;
  /** What the student has. Null when they have nothing to compare. */
  actual: string | null;
  status: "pass" | "fail" | "unknown";
  /** The two sides used different scales and were converted before comparing. */
  converted?: boolean;
  hint?: string;
};

/**
 * The student profile a business gets for having unlocked an enquiry. Shaped by the backend's
 * platform-users getProfile, so it is the same payload the student sees of themselves — minus the
 * phone number when they withheld it.
 */
export type UnlockedStudentProfile = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  /** The student declined to share their number; `phone` is null for that reason, not for lack of one. */
  phone_withheld: boolean;
  photo_url: string | null;
  cover_url: string | null;
  /** The platform_user_profiles row. Partial because the endpoint returns it verbatim and a thin
   *  profile legitimately has most of it null. */
  profile: Partial<StudentProfile> | null;
  // Reused from the personal portal rather than redeclared: this endpoint returns the same rows
  // the student sees of themselves, so the same types describe them and the two cannot drift.
  qualifications: Qualification[];
  language_tests: LanguageTest[];
  academic_tests: AcademicTest[];
  work_experiences: WorkExperience[];
};

export type DistributionListParams = { page?: number; limit?: number; search?: string; status?: string };

export type DistributionListResult = {
  data: DistributionListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** Per-status totals spanning every page — what the inbox tabs count. */
  counts: Record<string, number>;
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
  student_phone_withheld: boolean;
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
