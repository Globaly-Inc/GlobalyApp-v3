export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PaginationMeta };

export type Guide = {
  id: number;
  title: string;
  slug: string;
  country: string | null;
  context: string | null;
  background_image_url: string | null;
  background_video_url: string | null;
  pdf_url: string | null;
  pdf_cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type GuideWithLeadCount = Guide & { lead_count: number };

export type GuideInput = {
  title: string;
  slug: string;
  country: string | null;
  context: string | null;
  background_image_url: string | null;
  background_video_url: string | null;
  pdf_url: string | null;
  pdf_cover_image_url: string | null;
  is_published: boolean;
};

export type GuideListParams = {
  page?: number;
  limit?: number;
  search?: string;
  is_published?: boolean;
};

/** Files picked in the form but not yet uploaded — sent alongside `data` in one multipart request. */
export type GuideFiles = {
  background_image?: File | null;
  background_video?: File | null;
  pdf?: File | null;
  pdf_cover_image?: File | null;
};
