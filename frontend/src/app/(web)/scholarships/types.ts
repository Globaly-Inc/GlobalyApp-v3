export type PublicScholarship = {
  id: number;
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
};

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
