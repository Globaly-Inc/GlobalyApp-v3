// Wire types for /api/v3/ambassadors/*. Matches backend/src/modules/ambassadors/schemas + repositories.

export type CommissionType = "flat" | "percentage";
export type ProgramStatus = "draft" | "active" | "paused" | "closed";
export type ApplicationStatus = "pending" | "approved" | "rejected";

export type Program = {
  id: number;
  business_id: number;
  name: string;
  description: string | null;
  commission_type: CommissionType;
  /** Postgres numeric — arrives as a string. */
  commission_value: string;
  currency: string;
  status: ProgramStatus;
  created_at: string;
  updated_at: string;
};

export type CreateProgramInput = {
  name: string;
  description?: string | null;
  commission_type: CommissionType;
  commission_value: number;
  currency: string;
};

export type UpdateProgramInput = Partial<Omit<CreateProgramInput, "currency">> & { status?: ProgramStatus };

export type Application = {
  id: number;
  program_id: number;
  applicant_user_id: number;
  applicant_name: string;
  applicant_email: string;
  status: ApplicationStatus;
  note: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Ambassador = {
  id: number;
  program_id: number;
  user_id: number;
  application_id: number;
  referral_code: string;
  status: "active" | "suspended";
  connect_onboarding_status: "not_started" | "pending" | "complete";
};

export type ReviewResult = {
  application: Application;
  ambassador: Ambassador | null;
};
