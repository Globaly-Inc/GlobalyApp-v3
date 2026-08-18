/**
 * W6 — the sweep (Part 3 §4 W6).
 *
 * "Which columns hold storage URLs" is a question about DATA, so W6 answers it
 * with a query instead of a list. §8 counts "19 live supabase.co URLs" and W2b
 * tagged one column with `storageRehost`; both were true when written and neither
 * stays true, because every wave that lands carries more URLs into V3. A
 * hand-written inventory would go stale silently — which for a rehost means an
 * unrewritten column nobody notices until V1's project is deleted.
 *
 * So: every `text` / `varchar` / `bpchar` / `text[]` / `jsonb` / `json` column of
 * every ordinary table in every schema except the V1 mirror and W6's own report,
 * scanned for a pattern. Two passes, because the first is wide and the second is
 * expensive: pass 1 counts matching rows per column in batched UNION ALL
 * statements; pass 2 extracts the individual values, but only from the handful of
 * columns pass 1 found. Measured on the dev database: 2,273 candidate columns in
 * ~0.6s.
 *
 * The same machinery answers both directions — "which columns still hold a V1
 * URL" (before the rewrite) and "which columns hold a GCS key" (after it, for the
 * storage-completeness gate) — because they differ only in the pattern.
 */

import assert from "node:assert/strict";

import { quoteIdent, type TransformContext } from "./lib.js";

/** The V1 mirror and W6's own report are never rewrite targets. */
const EXCLUDED_SCHEMAS = ["pg_catalog", "information_schema", "v1_staging", "mig"];

/** Column types that can hold a URL. Anything else cannot, by type. */
const CANDIDATE_UDTS = ["text", "varchar", "bpchar", "jsonb", "json", "_text", "_varchar"];

/** Subqueries per statement in pass 1. Keeps one parse tree a sane size. */
const SWEEP_BATCH = 250;

export interface ColumnRef {
  schema: string;
  table: string;
  column: string;
  udt: string;
}

export interface SweepHit extends ColumnRef {
  /** Rows in which the column matches. */
  rows: number;
  /** Every matched value, with how many times it occurs. */
  values: Map<string, number>;
}

/** A pattern to sweep for: a row predicate and a per-value extractor, both SQL. */
export interface SweepPattern {
  predicate: (valueExpr: string) => string;
  extract: (valueExpr: string) => string;
}

export const qualified = (ref: ColumnRef): string => `${quoteIdent(ref.schema)}.${quoteIdent(ref.table)}`;
export const columnLabel = (ref: ColumnRef): string => `${ref.schema}.${ref.table}.${ref.column}`;
export const isArrayUdt = (udt: string): boolean => udt.startsWith("_");

/** The column's content as one searchable text value, whatever its type. */
export function valueExpr(ref: ColumnRef, alias = "s"): string {
  const col = `${alias}.${quoteIdent(ref.column)}`;
  return isArrayUdt(ref.udt) ? `array_to_string(${col}, ' ')` : `${col}::text`;
}

/** `_text` -> `text[]`: the cast an array rewrite needs to stay its own type. */
export function arrayType(udt: string): string {
  return `${udt.slice(1)}[]`;
}

/**
 * Every column in the database that could hold a URL.
 *
 * pg_class rather than information_schema.tables so views, matviews and foreign
 * tables are excluded by `relkind` rather than by hoping none exist.
 */
export async function candidateColumns(ctx: TransformContext): Promise<ColumnRef[]> {
  const { rows } = await ctx.db.query<ColumnRef>(
    `SELECT n.nspname AS schema, c.relname AS "table", a.attname AS "column", t.typname AS udt
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       JOIN pg_type t      ON t.oid = a.atttypid
      WHERE c.relkind = 'r'
        AND n.nspname <> ALL($1::text[])
        AND n.nspname NOT LIKE 'pg\\_%'
        AND t.typname = ANY($2::text[])
      ORDER BY 1, 2, 3`,
    [EXCLUDED_SCHEMAS, CANDIDATE_UDTS],
  );
  return rows;
}

/** Pass 1: matching row counts for every candidate, in batches. */
export async function matchingRowCounts(
  ctx: TransformContext,
  refs: readonly ColumnRef[],
  pattern: SweepPattern,
): Promise<Map<number, number>> {
  const hits = new Map<number, number>();
  for (let i = 0; i < refs.length; i += SWEEP_BATCH) {
    const batch = refs.slice(i, i + SWEEP_BATCH);
    const sql = batch
      .map(
        (ref, j) =>
          `SELECT ${i + j} AS idx, count(*)::int AS n FROM ${qualified(ref)} s ` +
          `WHERE ${pattern.predicate(valueExpr(ref))}`,
      )
      .join(" UNION ALL ");
    const { rows } = await ctx.db.query<{ idx: number; n: number }>(`SELECT * FROM (${sql}) z WHERE n > 0`);
    for (const r of rows) hits.set(r.idx, r.n);
  }
  return hits;
}

/** Pass 2: the individual matched values in one column. */
export async function matchedValues(
  ctx: TransformContext,
  ref: ColumnRef,
  pattern: SweepPattern,
): Promise<Map<string, number>> {
  const { rows } = await ctx.db.query<{ value: string; n: number }>(
    `SELECT m[1] AS value, count(*)::int AS n
       FROM ${qualified(ref)} s, LATERAL ${pattern.extract(valueExpr(ref))} m
      GROUP BY 1 ORDER BY 1`,
  );
  return new Map(rows.map((r) => [r.value, r.n]));
}

/** Both passes: every column that matches, with everything it matched. */
export async function sweep(ctx: TransformContext, pattern: SweepPattern): Promise<SweepHit[]> {
  const candidates = await candidateColumns(ctx);
  const counts = await matchingRowCounts(ctx, candidates, pattern);
  const out: SweepHit[] = [];
  for (const [idx, rows] of [...counts].sort((a, b) => a[0] - b[0])) {
    const ref = candidates[idx];
    out.push({ ...ref, rows, values: await matchedValues(ctx, ref, pattern) });
  }
  return out;
}

export function sweepSelfCheck(): void {
  const text: ColumnRef = { schema: "public", table: "businesses", column: "logo_url", udt: "text" };
  const arr: ColumnRef = { schema: "public", table: "businesses", column: "gallery_images", udt: "_text" };

  assert.equal(columnLabel(text), "public.businesses.logo_url");
  assert.equal(qualified(text), '"public"."businesses"');
  assert.equal(valueExpr(text), 's."logo_url"::text');
  // An array cannot be cast to text and searched as one string by accident — it
  // has to be flattened, or the predicate silently matches nothing.
  assert.equal(valueExpr(arr), `array_to_string(s."gallery_images", ' ')`);
  assert.equal(arrayType("_text"), "text[]");
  assert.equal(arrayType("_varchar"), "varchar[]");
  assert.ok(isArrayUdt("_text") && !isArrayUdt("jsonb"));

  // A schema-qualified identifier must be quoted: V3's tenant schemas are
  // uuid-named, so `3829ff2a-…` is not a bare identifier anywhere.
  assert.equal(qualified({ ...text, schema: "3829ff2a-7ff9" }), '"3829ff2a-7ff9"."businesses"');
}
