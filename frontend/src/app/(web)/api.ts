import type { PlatformStats } from "./types";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v3`;

/**
 * Corpus-wide counts for the marketing stat bars. Backed by the same visibility rules the
 * search tabs use, so the figures always match what a visitor can actually browse.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const res = await fetch(`${API_BASE}/platform-stats`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error("Failed to load platform stats");
  return res.json();
}
