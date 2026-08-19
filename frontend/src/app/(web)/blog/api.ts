import type { Paginated, PublicBlogPost } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getPosts(params: {
  page?: number;
  category?: string;
  country_focus?: string;
}): Promise<Paginated<PublicBlogPost>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.category) qs.set("category", params.category);
  if (params.country_focus) qs.set("country_focus", params.country_focus);
  const res = await fetch(`${API_BASE}/blog/posts?${qs}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load blog posts");
  return res.json();
}

// Slug or numeric id: the canonical URL is /blog/{slug} (V1's, and what search
// engines indexed), but the id form is still served so earlier V3 links resolve.
export async function getPost(idOrSlug: string): Promise<PublicBlogPost | null> {
  const res = await fetch(`${API_BASE}/blog/posts/${encodeURIComponent(idOrSlug)}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load blog post");
  return res.json();
}

export async function getFilters(): Promise<{ categories: string[]; countries: string[] }> {
  const res = await fetch(`${API_BASE}/blog/filters`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load blog filters");
  return res.json();
}
