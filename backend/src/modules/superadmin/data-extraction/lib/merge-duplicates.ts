// Duplicate-merge planning — the pure half of the merge, so the destructive half
// has nothing left to decide.
//
// PORTED FROM (read, not copied): V1's SQL RPC
// merge_extraction_job_duplicates(job, dry_run) → merge_business_duplicate_fees_and_eligibility,
// which content-hashes a business's service_fees and service_eligibility_requirements,
// keeps the oldest row per hash and deletes the rest. The hashes below cover the
// same fields in the same order as V1's fee_match_hash() / eligibility_match_hash()
// so a V1-merged tenant and a V3-merged tenant group identically.
//
// TWO V1 DEFECTS ARE DELIBERATELY NOT REPRODUCED (§1.6 — legacy bugs are not the spec):
//
// D8-shaped orphan. V1 re-points only the duplicate row's OWNER service
// (`duplicates.dup_service_id`) at the survivor. Any *other* service that reached
// that duplicate through service_fee_assignments loses it outright: the DELETE
// cascades the junction row away and nothing re-points it, so a live service
// silently stops having a fee. `access_before` here is the union of owner links AND
// junction links, and every service in it is guaranteed a link to the survivor.
//
// Nondeterministic survivor. V1's group ordering (hash, created_at, id) is total,
// but its job → business lookup is `LIMIT 1` with no ORDER BY, so which business
// got merged was luck. Survivor choice here is (created_at ASC, id ASC), and the
// caller resolves the target from the promotion ledger rather than guessing.

import { createHash } from "node:crypto";

/** md5 of the same fields, in the same order, as V1's public.fee_match_hash(). */
export function feeMatchHash(row: {
  name?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
}): string {
  return md5([
    (row.name ?? "").trim().toLowerCase(),
    row.total_amount == null ? "0" : String(row.total_amount),
    (row.currency ?? "").trim().toUpperCase(),
  ]);
}

/** md5 of the same fields, in the same order, as V1's public.eligibility_match_hash(). */
export function eligibilityMatchHash(row: {
  min_degree_level?: string | null;
  min_score_percent?: string | number | null;
  language_tests?: unknown;
  academic_tests?: unknown;
}): string {
  return md5([
    (row.min_degree_level ?? "").trim().toLowerCase(),
    row.min_score_percent == null ? "" : String(row.min_score_percent),
    jsonText(row.language_tests),
    jsonText(row.academic_tests),
  ]);
}

function md5(parts: string[]): string {
  return createHash("md5").update(parts.join("|")).digest("hex");
}

/** node-postgres hands jsonb back already parsed; stringify is the stable form. */
function jsonText(value: unknown): string {
  if (value == null) return "[]";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export interface MergeableRow {
  id: string;
  /** The owning service. Null only where the live table allows a shared row. */
  service_id: string | null;
  created_at: Date | string;
  hash: string;
}

export interface MergeAssignment {
  id: string;
  service_id: string;
  /** The row this junction points at. */
  target_id: string;
}

export interface MergeGroup {
  hash: string;
  keep_id: string;
  dup_ids: string[];
  /** Every service that could reach ANY row in this group before the merge. */
  access_before: string[];
  /** Junction rows that must exist afterwards so access_before survives. */
  repoints: string[];
}

export interface MergePlan {
  /** Hash groups holding more than one row. */
  groups: number;
  /** Rows that will be deleted. */
  merged: number;
  merges: MergeGroup[];
}

export const EMPTY_PLAN: MergePlan = { groups: 0, merged: 0, merges: [] };

/**
 * Group by content hash, pick the survivor, and work out which services need a
 * junction row so that not one of them loses access.
 *
 * A row with no hash-group sibling is not touched at all — which is what makes a
 * second run a no-op rather than a second merge.
 */
export function planMerge(rows: readonly MergeableRow[], assignments: readonly MergeAssignment[]): MergePlan {
  const assignedBy = new Map<string, string[]>();
  for (const assignment of assignments) {
    const list = assignedBy.get(assignment.target_id);
    if (list) list.push(assignment.service_id);
    else assignedBy.set(assignment.target_id, [assignment.service_id]);
  }

  const byHash = new Map<string, MergeableRow[]>();
  for (const row of rows) {
    const list = byHash.get(row.hash);
    if (list) list.push(row);
    else byHash.set(row.hash, [row]);
  }

  const merges: MergeGroup[] = [];
  for (const [hash, group] of byHash) {
    if (group.length < 2) continue;

    const ordered = [...group].sort(compareRows);
    const [keep, ...dups] = ordered;

    const access = new Set<string>();
    for (const row of ordered) {
      if (row.service_id) access.add(row.service_id);
      for (const serviceId of assignedBy.get(row.id) ?? []) access.add(serviceId);
    }

    // The survivor's own service_id already links it; everyone else needs a junction.
    const alreadyLinked = new Set<string>(assignedBy.get(keep.id) ?? []);
    if (keep.service_id) alreadyLinked.add(keep.service_id);

    merges.push({
      hash,
      keep_id: keep.id,
      dup_ids: dups.map((row) => row.id),
      access_before: [...access].sort(),
      repoints: [...access].filter((serviceId) => !alreadyLinked.has(serviceId)).sort(),
    });
  }

  merges.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));

  return {
    groups: merges.length,
    merged: merges.reduce((total, group) => total + group.dup_ids.length, 0),
    merges,
  };
}

/** Oldest wins; id breaks ties so the choice is total and reproducible. */
function compareRows(a: MergeableRow, b: MergeableRow): number {
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The guard. Given what each surviving row can actually be reached by NOW, report
 * every service the group could reach it by BEFORE and can no longer.
 *
 * This is the assertion defect D8 exists for: the re-point insert has to tolerate
 * a pair that already exists, which at the statement level is indistinguishable
 * from a re-point that never happened. Counting the parents is the only thing that
 * tells those apart, so nothing is allowed to commit without it.
 */
export function findOrphans(
  plan: MergePlan,
  accessAfter: ReadonlyMap<string, readonly string[]>,
): { keep_id: string; lost: string[] }[] {
  const orphaned: { keep_id: string; lost: string[] }[] = [];
  for (const group of plan.merges) {
    const after = new Set(accessAfter.get(group.keep_id) ?? []);
    const lost = group.access_before.filter((serviceId) => !after.has(serviceId));
    if (lost.length) orphaned.push({ keep_id: group.keep_id, lost });
  }
  return orphaned;
}
