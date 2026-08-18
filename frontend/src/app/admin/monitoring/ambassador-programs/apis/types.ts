/** Mirrors the backend ambassadors module's admin monitoring payloads (Wave G4). */

export type AmbassadorProgramStatus = "draft" | "active" | "paused" | "archived";

/** One row of GET /admin/monitoring/ambassador-programs. */
export type AdminAmbassadorProgram = {
  id: number;
  business_id: number;
  business_name: string | null;
  name: string;
  slug: string;
  status: AmbassadorProgramStatus;
  created_at: string;
  active_ambassadors: number;
  pending_applications: number;
  total_inquiries: number;
  resolved_inquiries: number;
};

export type AdminAmbassadorStats = {
  programs: { total: number; active: number };
  ambassadors: { total: number; active: number };
  inquiries: { total: number; resolved: number; last_7_days: number; escalated: number };
  /** `paid_minor` is minor currency units — the backend never stores float money. */
  payouts: { total: number; paid_minor: number; failed: number };
};

export type ListAmbassadorProgramsParams = {
  status?: AmbassadorProgramStatus;
  business_id?: number;
  page?: number;
  limit?: number;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
