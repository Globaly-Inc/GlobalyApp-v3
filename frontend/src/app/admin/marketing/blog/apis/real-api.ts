import { httpDelete, httpGet, httpPatch, httpPost, httpPostForm } from "@/lib/api/http";
import type {
  BlogKeyword, BlogKeywordInput, BlogPost, BlogPostInput, BlogPostListParams, Paginated,
} from "./types";

const BASE = "/admin/marketing/blog";

function toQuery(params: BlogPostListParams): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.search) search.set("search", params.search);
  if (params.category) search.set("category", params.category);
  if (params.is_published !== undefined) search.set("is_published", String(params.is_published));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const blogRealApi = {
  getPosts: (params: BlogPostListParams = {}): Promise<Paginated<BlogPost>> =>
    httpGet(`${BASE}/posts${toQuery(params)}`),
  getPostById: (id: number): Promise<BlogPost> => httpGet(`${BASE}/posts/${id}`),
  createPost: (input: BlogPostInput): Promise<BlogPost> => httpPost(`${BASE}/posts`, input),
  updatePost: (id: number, input: Partial<BlogPostInput>): Promise<BlogPost> =>
    httpPatch(`${BASE}/posts/${id}`, input),
  deletePost: (id: number): Promise<void> => httpDelete(`${BASE}/posts/${id}`),
  uploadCoverImage: (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`${BASE}/posts/cover-image`, form);
  },

  getKeywords: async (isActive?: boolean): Promise<BlogKeyword[]> =>
    (await httpGet<{ keywords: BlogKeyword[] }>(`${BASE}/keywords${isActive !== undefined ? `?is_active=${isActive}` : ""}`)).keywords,
  createKeyword: (input: BlogKeywordInput): Promise<BlogKeyword> => httpPost(`${BASE}/keywords`, input),
  updateKeyword: (id: number, input: Partial<BlogKeywordInput>): Promise<BlogKeyword> =>
    httpPatch(`${BASE}/keywords/${id}`, input),
  deleteKeyword: (id: number): Promise<void> => httpDelete(`${BASE}/keywords/${id}`),
};
