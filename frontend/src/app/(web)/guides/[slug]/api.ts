import type { PublicGuide } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

export async function getGuideBySlug(slug: string): Promise<PublicGuide | null> {
  const res = await fetch(`${API_BASE}/public/guides/${slug}`, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load guide");
  return res.json();
}
