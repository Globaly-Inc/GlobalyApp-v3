import type { Paginated, PublicScholarship } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getScholarships(params: {
  page?: number;
  q?: string;
  country?: string;
  limit?: number;
}): Promise<Paginated<PublicScholarship>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.q) qs.set("q", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/scholarships?${qs}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error("Failed to load scholarships");
  return res.json();
}

export async function getScholarshipBySlug(slug: string): Promise<PublicScholarship | null> {
  const res = await fetch(`${API_BASE}/scholarships/${slug}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load scholarship");
  return res.json();
}
