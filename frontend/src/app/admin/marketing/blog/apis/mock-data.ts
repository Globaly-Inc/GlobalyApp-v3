import type {
  BlogKeyword, BlogKeywordInput, BlogPost, BlogPostInput, BlogPostListParams, Paginated,
} from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paginate<T>(rows: T[], { page = 1, limit = 20 }: BlogPostListParams): Paginated<T> {
  const offset = (page - 1) * limit;
  return {
    data: rows.slice(offset, offset + limit),
    meta: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) },
  };
}

let nextId = 100;
const newId = () => ++nextId;

const posts: BlogPost[] = [
  {
    id: 1, title: "5 Things to Know Before Studying in Canada", slug: "5-things-before-studying-canada",
    excerpt: "A quick checklist for prospective international students.", content: "<p>Canada is a top destination for international students...</p><h2>Cost of living</h2><p>Budget carefully.</p>",
    category: "Study", country_focus: "Canada", tags: ["canada", "study-abroad"],
    creator_id: 1, author_name: "Globaly Team", author_avatar_url: null, cover_image_url: null,
    is_published: true, published_at: "2026-01-02T00:00:00.000Z", views: 342, reading_time_minutes: 4,
    meta_title: "5 Things to Know Before Studying in Canada", meta_description: "A quick checklist for prospective international students moving to Canada.",
    focus_keyword: "studying in canada", seo_score: 70, canonical_url: null, og_image_url: null,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: 2, title: "UK Graduate Visa Route Explained", slug: "uk-graduate-visa-route-explained",
    excerpt: "Everything you need to know about staying on to work after graduation.", content: "<p>Draft in progress...</p>",
    category: "Work", country_focus: "United Kingdom", tags: ["uk", "visa"],
    creator_id: 1, author_name: "Globaly Team", author_avatar_url: null, cover_image_url: null,
    is_published: false, published_at: null, views: 0, reading_time_minutes: 3,
    meta_title: null, meta_description: null, focus_keyword: null, seo_score: 20, canonical_url: null, og_image_url: null,
    created_at: "2026-01-05T00:00:00.000Z", updated_at: "2026-01-05T00:00:00.000Z",
  },
];

const keywords: BlogKeyword[] = [
  { id: 1, keyword: "study in australia", category: "Study", difficulty: "medium", is_active: true },
  { id: 2, keyword: "student visa uk", category: "Visa", difficulty: "hard", is_active: true },
];

export const blogMockApi = {
  getPosts: async (params: BlogPostListParams = {}): Promise<Paginated<BlogPost>> => {
    console.log("[mock] GET /admin/platform/blog/posts", params);
    await delay(300);
    let rows = posts;
    if (params.search) rows = rows.filter((p) => p.title.toLowerCase().includes(params.search!.toLowerCase()));
    if (params.category) rows = rows.filter((p) => p.category === params.category);
    if (params.is_published !== undefined) rows = rows.filter((p) => p.is_published === params.is_published);
    return paginate(rows, params);
  },
  getPostById: async (id: number): Promise<BlogPost> => {
    console.log("[mock] GET /admin/platform/blog/posts/:id", id);
    await delay(200);
    const row = posts.find((p) => p.id === id);
    if (!row) throw new Error("Blog post not found");
    return row;
  },
  createPost: async (input: BlogPostInput): Promise<BlogPost> => {
    console.log("[mock] POST /admin/platform/blog/posts", input);
    await delay(300);
    const row: BlogPost = {
      ...input, id: newId(), creator_id: 1, views: 0, seo_score: 0,
      reading_time_minutes: Math.max(1, Math.round((input.content ?? "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200)),
      published_at: input.is_published ? new Date().toISOString() : null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    posts.unshift(row);
    return row;
  },
  updatePost: async (id: number, input: Partial<BlogPostInput>): Promise<BlogPost> => {
    console.log("[mock] PATCH /admin/platform/blog/posts/:id", id, input);
    await delay(300);
    const index = posts.findIndex((p) => p.id === id);
    const existing = posts[index]!;
    const updated: BlogPost = {
      ...existing, ...input,
      published_at: input.is_published && !existing.is_published ? new Date().toISOString() : existing.published_at,
      updated_at: new Date().toISOString(),
    };
    posts[index] = updated;
    return updated;
  },
  deletePost: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/blog/posts/:id", id);
    await delay(300);
    const index = posts.findIndex((p) => p.id === id);
    if (index !== -1) posts.splice(index, 1);
  },
  uploadCoverImage: async (file: File): Promise<{ url: string }> => {
    console.log("[mock] POST /admin/platform/blog/posts/cover-image", file.name);
    await delay(300);
    return { url: URL.createObjectURL(file) };
  },

  getKeywords: async (isActive?: boolean): Promise<BlogKeyword[]> => {
    console.log("[mock] GET /admin/platform/blog/keywords", isActive);
    await delay(200);
    return isActive === undefined ? [...keywords] : keywords.filter((k) => k.is_active === isActive);
  },
  createKeyword: async (input: BlogKeywordInput): Promise<BlogKeyword> => {
    console.log("[mock] POST /admin/platform/blog/keywords", input);
    await delay(300);
    const row: BlogKeyword = { ...input, id: newId() };
    keywords.unshift(row);
    return row;
  },
  updateKeyword: async (id: number, input: Partial<BlogKeywordInput>): Promise<BlogKeyword> => {
    console.log("[mock] PATCH /admin/platform/blog/keywords/:id", id, input);
    await delay(300);
    const index = keywords.findIndex((k) => k.id === id);
    const updated = { ...keywords[index]!, ...input };
    keywords[index] = updated;
    return updated;
  },
  deleteKeyword: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /admin/platform/blog/keywords/:id", id);
    await delay(300);
    const index = keywords.findIndex((k) => k.id === id);
    if (index !== -1) keywords.splice(index, 1);
  },
};
