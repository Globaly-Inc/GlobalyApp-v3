import type { PublicGuide } from "./[slug]/types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getPublishedGuides(): Promise<PublicGuide[]> {
  const res = await fetch(`${API_BASE}/public/guides`, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  return res.json();
}
