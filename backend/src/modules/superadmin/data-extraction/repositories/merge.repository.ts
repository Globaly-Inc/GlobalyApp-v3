// Merge repository — tenant-catalog reads and the destructive writes.
//
// Every function takes an explicit `trx`. masterKnex has no searchPath and tenant
// schemas live in the SAME database, so one transaction on one connection covers
// the tenant catalog, the master catalog_services projection (trigger-maintained,
// so it commits with the write) and superadmin.* at once. That is what makes "a
// half-merged catalog is never visible" true rather than aspirational — the same
// argument promote.repository.ts makes.
//
// Column lists are explicit everywhere. `select *` on a tenant table is how a
// column nobody meant to expose ends up in an API response.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { OrgType } from "./promote.repository.js";

/** The two live tables V1's RPC dedupes, and the junction that shares each one. */
export const MERGE_TARGETS = {
  fees: {
    table: "service_fees",
    junction: "service_fee_assignments",
    junctionColumn: "service_fee_id",
    /** Hash inputs — the same fields as V1's fee_match_hash(). */
    columns: ["id", "service_id", "created_at", "name", "total_amount", "currency"],
  },
  eligibility: {
    table: "service_eligibility_requirements",
    junction: "service_eligibility_assignments",
    junctionColumn: "eligibility_requirement_id",
    /** Hash inputs — the same fields as V1's eligibility_match_hash(). */
    columns: [
      "id",
      "service_id",
      "created_at",
      "min_degree_level",
      "min_score_percent",
      "language_tests",
      "academic_tests",
    ],
  },
} as const;

export type MergeKind = keyof typeof MERGE_TARGETS;

export interface PromotionTarget {
  org_type: OrgType;
  org_id: number;
  schema_name: string;
}

/**
 * Where this job's rows actually went. The promotion ledger is authoritative — it
 * records the schema promote wrote into — which is the fix for V1's `LIMIT 1` with
 * no ORDER BY over a website-or-name join that could pick any matching business.
 * Dry-run attempts are ignored: they wrote nothing.
 */
export async function findPromotionTarget(jobId: string): Promise<PromotionTarget | null> {
  const row = await masterKnex(`${S}.extraction_promotions`)
    .where({ job_id: jobId, dry_run: false })
    .orderBy("created_at", "desc")
    .first("target_org_type", "target_org_id", "schema_name");

  return row
    ? { org_type: row.target_org_type, org_id: row.target_org_id, schema_name: row.schema_name }
    : null;
}

/** Live rows in scope, soft-deleted ones excluded — a deleted row is not a duplicate. */
export async function loadRows(trx: Knex, schema: string, kind: MergeKind) {
  const target = MERGE_TARGETS[kind];
  return trx(target.table)
    .withSchema(schema)
    .whereNull("deleted_at")
    .select(...target.columns)
    .orderBy("created_at", "asc") as Promise<Record<string, unknown>[]>;
}

export interface JunctionRow {
  id: string;
  service_id: string;
  target_id: string;
}

export async function loadJunctions(trx: Knex, schema: string, kind: MergeKind): Promise<JunctionRow[]> {
  const target = MERGE_TARGETS[kind];
  const rows = await trx(target.junction)
    .withSchema(schema)
    .whereNull("deleted_at")
    .select("id", "service_id", `${target.junctionColumn} as target_id`);
  return rows as JunctionRow[];
}

/**
 * Give every service in `repoints` a junction row to the survivor.
 *
 * `.onConflict().ignore()` is unavoidable — the pair may already exist from an
 * earlier merge or a concurrent promote — and it is exactly why the caller has to
 * count parents afterwards instead of trusting the row count here. See
 * lib/merge-duplicates.ts findOrphans().
 */
export async function repoint(
  trx: Knex,
  schema: string,
  kind: MergeKind,
  rows: readonly { service_id: string; keep_id: string }[],
): Promise<number> {
  if (!rows.length) return 0;
  const target = MERGE_TARGETS[kind];
  const inserted = await trx(target.junction)
    .withSchema(schema)
    .insert(rows.map((row) => ({ service_id: row.service_id, [target.junctionColumn]: row.keep_id })))
    .onConflict(["service_id", target.junctionColumn])
    .ignore()
    .returning("id");
  return inserted.length;
}

/** Hard delete, as V1's RPC does. Junction rows pointing here cascade. */
export async function deleteRows(
  trx: Knex,
  schema: string,
  kind: MergeKind,
  ids: readonly string[],
): Promise<number> {
  if (!ids.length) return 0;
  return trx(MERGE_TARGETS[kind].table).withSchema(schema).whereIn("id", ids as string[]).del();
}

/**
 * Which services can reach each of `keepIds` right now — owner link plus junction
 * links, read back from the database after the writes. This is the "after" half of
 * the parent-count assertion; nothing commits without it.
 */
export async function accessAfter(
  trx: Knex,
  schema: string,
  kind: MergeKind,
  keepIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!keepIds.length) return out;

  const target = MERGE_TARGETS[kind];
  const add = (keepId: string, serviceId: string | null) => {
    if (!serviceId) return;
    const list = out.get(keepId);
    if (list) list.push(serviceId);
    else out.set(keepId, [serviceId]);
  };

  const owners = await trx(target.table)
    .withSchema(schema)
    .whereIn("id", keepIds as string[])
    .whereNull("deleted_at")
    .select("id", "service_id");
  for (const row of owners) add(row.id, row.service_id);

  const junctions = await trx(target.junction)
    .withSchema(schema)
    .whereIn(target.junctionColumn, keepIds as string[])
    .whereNull("deleted_at")
    .select(`${target.junctionColumn} as target_id`, "service_id");
  for (const row of junctions) add(row.target_id, row.service_id);

  return out;
}
