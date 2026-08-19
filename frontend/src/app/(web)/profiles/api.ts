import type { OrgKind, OrgProfile } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

/** The route segment carries the kind, so an agent slug 404s under /institutions and vice versa. */
const PATH: Record<OrgKind, string> = { institution: "institutions", agent: "agents" };

export async function getOrgProfile(kind: OrgKind, slug: string): Promise<OrgProfile | null> {
  const res = await fetch(`${API_BASE}/catalog/${PATH[kind]}/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load profile");
  const { data } = (await res.json()) as { data: OrgProfile };
  return data;
}

/** Where a directory card should point for an org of this kind. */
export function profileHref(kind: OrgKind, slug: string): string {
  return `/${PATH[kind]}/${slug}`;
}
