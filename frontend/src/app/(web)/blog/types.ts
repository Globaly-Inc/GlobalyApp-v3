export type PublicBlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  country_focus: string | null;
  tags: string[];
  author_name: string | null;
  author_avatar_url: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  views: number;
  reading_time_minutes: number;
  meta_title: string | null;
  meta_description: string | null;
};

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };
