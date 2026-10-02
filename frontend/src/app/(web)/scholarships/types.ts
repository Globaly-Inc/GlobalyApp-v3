export type PublicScholarship = {
  /** A number for platform scholarships, a uuid for an institution's own. */
  id: number | string;
  title: string;
  slug: string;
  description: string | null;
  provider_name: string | null;
  source_type: string;
  country: string | null;
  city: string | null;
  region: string | null;
  basis: string | null;
  degree_levels: string[];
  requirements_summary: string | null;
  coverage_type: string;
  coverage_amount: number | null;
  coverage_currency: string | null;
  coverage_description: string | null;
  deadline: string | null;
  deadline_notes: string | null;
  application_url: string | null;
  source_url: string | null;
  is_featured: boolean;
  view_count: number;
  /** Set when this is an institution's own scholarship (provider_name is that institution). */
  institution_id?: number | null;
};

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
