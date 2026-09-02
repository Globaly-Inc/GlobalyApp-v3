import type { CourseAssignment, JunctionSlug, TimestampedRow } from "../apis/types";

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

// A fee the LLM couldn't confidently parse a number/currency for (a range, "Contact us", etc.)
// is stored with a null amount/currency rather than a fake $0 — fall back to the fee's own name
// instead of rendering "0", which would look like a real, confirmed zero-cost fee.
export function feeAmount(f: { currency: string | null; total_amount: number | null; name: string | null }): string {
  return f.total_amount != null ? `${f.currency ?? ""} ${f.total_amount}`.trim() : (f.name ?? "Fee");
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

export type PendingCourseLink = { junction: JunctionSlug; course_id: string; entity_id: string };

export function pendingCourseLinks(
  selections: { junction: JunctionSlug; entityId?: string; assignments?: CourseAssignment[]; entityCol: string }[],
  courseIds: string[],
): PendingCourseLink[] {
  return selections.flatMap(({ junction, entityId, assignments, entityCol }) => {
    if (!entityId) return [];
    const alreadyLinked = new Set((assignments ?? []).filter((a) => a[entityCol] === entityId).map((a) => a.course_id));
    return courseIds.filter((id) => !alreadyLinked.has(id)).map((course_id) => ({ junction, course_id, entity_id: entityId }));
  });
}

/**
 * Runs `tasks` with at most `limit` in flight at once, collecting per-task results instead
 * of failing the whole batch on the first rejection — used for bulk admin actions (e.g.
 * updating/linking up to 50 courses) that hit plain request/response endpoints with no
 * queue behind them, so a burst of 100+ simultaneous requests doesn't strain the DB pool.
 */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks[i]!;
      try {
        results[i] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
