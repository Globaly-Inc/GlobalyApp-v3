import type { TimestampedRow } from "../apis/types";

/**
 * The subset of `values` that differs from `original`.
 *
 * Forms submit every field on save, but save-and-learn counts each key in the patch as an
 * admin correction — a full-form patch would manufacture AI Memory lessons about fields
 * nobody touched. Compared as JSON so arrays and objects don't read as changed every time.
 */
export function changedFields(
  original: Record<string, unknown> | null | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(values)) {
    if (JSON.stringify(norm(original?.[key])) !== JSON.stringify(norm(next))) patch[key] = next;
  }
  return patch;
}

// Postgres hands back decimal columns as strings ("1500.00") while the forms submit numbers,
// so a raw compare would mark every fee's total_amount as corrected on every save.
function norm(v: unknown): unknown {
  if (v === undefined || v === "") return null;
  if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

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
export function latestTimestamp(rows: TimestampedRow[] | null | undefined): string | null {
  let best: string | null = null;
  if (!rows || rows.length === 0) return null;
  for (const r of rows) {
    const t = r.updated_at || r.created_at || null;
    if (t && (!best || t > best)) best = t;
  }
  return best;
}
