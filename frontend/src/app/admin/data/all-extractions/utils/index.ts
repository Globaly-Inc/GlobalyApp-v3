import type { TimestampedRow } from "../apis/types";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// Most-recent-first "updated" timestamp across a set of rows — falls back
// to created_at for tables that don't carry updated_at.
export function latestTimestamp(rows: TimestampedRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const t = r.updated_at || r.created_at || null;
    if (t && (!best || t > best)) best = t;
  }
  return best;
}
