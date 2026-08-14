export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PaginationMeta };

export type BlogTopic = "Study" | "Work" | "Live";
export type KeywordDifficulty = "easy" | "medium" | "hard";

export type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  country_focus: string | null;
  tags: string[];
  creator_id: number | null;
  author_name: string | null;
  author_avatar_url: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  views: number;
  reading_time_minutes: number;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  seo_score: number | null;
  canonical_url: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = {
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
  is_published: boolean;
  meta_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  canonical_url: string | null;
  og_image_url: string | null;
};

export type BlogPostListParams = {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  is_published?: boolean;
};

export type BlogKeyword = {
  id: number;
  keyword: string;
  category: string | null;
  difficulty: KeywordDifficulty | null;
  is_active: boolean;
};

export type BlogKeywordInput = {
  keyword: string;
  category: string | null;
  difficulty: KeywordDifficulty | null;
  is_active: boolean;
};
