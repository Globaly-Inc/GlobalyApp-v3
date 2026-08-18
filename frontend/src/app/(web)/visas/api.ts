import type { VisaDetail, VisaListItem } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

/** V1's search_visas RPC. Returns a bare array, as the RPC did. */
export async function searchVisas(params: {
  q?: string;
  country?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<VisaListItem[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.category) qs.set("category", params.category);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE}/visas?${qs}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to load visas");
  return res.json();
}

/** V1's get_visa_detail RPC, keyed on (country, subclass) exactly as it was. */
export async function getVisaDetail(country: string, subclass: string): Promise<VisaDetail | null> {
  const res = await fetch(
    `${API_BASE}/visas/${encodeURIComponent(country)}/${encodeURIComponent(subclass)}`,
    { next: { revalidate: 300 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load visa");
  return res.json();
}
