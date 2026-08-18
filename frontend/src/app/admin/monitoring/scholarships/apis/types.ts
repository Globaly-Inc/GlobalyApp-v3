export type ReviewStatus = "pending" | "approved" | "rejected";
export type SourceType = "university" | "independent" | "government" | "foundation" | "other";
export type Basis = "merit" | "need" | "sports" | "diversity" | "government" | "research" | "other";
export type CoverageType = "full_tuition" | "partial_tuition" | "stipend" | "living_allowance" | "various" | "other";

export type Scholarship = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  provider_name: string | null;
  source_type: SourceType;
  country: string | null;
  city: string | null;
  region: string | null;
  basis: Basis | null;
  degree_levels: string[];
  requirements_summary: string | null;
  coverage_type: CoverageType;
  coverage_amount: number | null;
  coverage_currency: string | null;
  coverage_description: string | null;
  deadline: string | null;
  deadline_notes: string | null;
  application_url: string | null;
  source_url: string | null;
  is_published: boolean;
  is_featured: boolean;
  view_count: number;
  // Moderation (Wave G1). Admin-only — the public directory never returns these.
  review_status: ReviewStatus;
  review_note: string | null;
  reviewed_at: string | null;
  owner_org_type: "business" | "institution" | null;
  owner_org_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ScholarshipInput = Omit<
  Scholarship,
  "id" | "view_count" | "created_at" | "updated_at" | "review_status" | "review_note" | "reviewed_at"
>;

export type ScholarshipStats = {
  total: number;
  published: number;
  pending: number;
  approved: number;
  rejected: number;
  featured: number;
};

export type ListScholarshipsParams = {
  q?: string;
  review_status?: ReviewStatus;
  limit?: number;
};

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
