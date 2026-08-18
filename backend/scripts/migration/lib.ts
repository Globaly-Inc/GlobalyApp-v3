/**
 * Stage 2 — the transform runner (Part 3 §4 W0, conventions from §1.5).
 *
 * Every wave's transform is a function that reads ONLY from `v1_staging` and
 * writes into public / superadmin / a tenant schema. This module is the harness
 * they all share: one transaction, dry-run by default, a reason-coded report,
 * and the resolver maps in the `mig` schema.
 *
 * The five conventions, none of them negotiable:
 *
 *   1. ONE TRANSACTION, and dry-run runs the IDENTICAL code path as --apply.
 *      The only difference is the final statement: ROLLBACK or COMMIT. A dry-run
 *      that takes a different branch is not a rehearsal, it is a second program
 *      that has never been tested.
 *   2. COLUMNS ARE INTROSPECTED, both sides, at run time. No hardcoded column
 *      maps to rot: import-v2.ts already proved the pattern across 34 tables,
 *      and the 24 columns the hand-written importers silently skipped are why
 *      anything unmapped is REPORTED rather than dropped.
 *   3. IDEMPOTENT BY CONSTRUCTION. Natural-key upserts, batched. A second run is
 *      a no-op; an interrupted run is fixed by running it again.
 *   4. UNRESOLVED REFERENCES GO TO mig.unresolved WITH A REASON CODE FROM A
 *      CLOSED ENUM — never silently dropped, never silently NULLed. NULL is
 *      written only where the V3 schema says absent is valid business state.
 *      An unknown reason code throws: Gate 2 check 6 treats "unexplained" as red,
 *      so the runner refuses to create one.
 *   5. JUNCTION LOADERS ASSERT THEIR PARENT COUNTS BEFORE INSERTING (defect D8).
 *      `ON CONFLICT DO NOTHING` on a junction turns a parent-ordering bug into a
 *      silent orphan — the guard is what stops that being discovered in prod.
 *
 * CLI:
 *   node --import tsx scripts/migration/lib.ts --self-check
 *   node --import tsx scripts/migration/lib.ts --ensure-mig --apply --url=…
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(HERE, "mapping.json");

export const STAGING_SCHEMA = "v1_staging";
export const MIG_SCHEMA = "mig";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RunnerFlags {
  apply: boolean;
  selfCheck: boolean;
  ensureMig: boolean;
  json: boolean;
  url: string | null;
  only: string[] | null;
  batchSize: number;
}

export interface UnresolvedEntry {
  sourceTable: string;
  sourceKey: string;
  targetTable?: string | null;
  column?: string | null;
  reasonCode: string;
  detail?: string | null;
}

export interface RunReport {
  runId: string;
  wave: string;
  apply: boolean;
  written: Record<string, number>;
  unresolved: UnresolvedEntry[];
  notes: string[];
}

export interface TransformContext {
  db: pg.ClientBase;
  apply: boolean;
  wave: string;
  runId: string;
  batchSize: number;
  report: RunReport;
}

export class MigrationError extends Error {}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseRunnerArgs(argv: readonly string[]): RunnerFlags {
  const flags: RunnerFlags = {
    apply: false,
    selfCheck: false,
    ensureMig: false,
    json: false,
    url: null,
    only: null,
    batchSize: 500,
  };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--dry-run") flags.apply = false;
    else if (arg === "--self-check") flags.selfCheck = true;
    else if (arg === "--ensure-mig") flags.ensureMig = true;
    else if (arg === "--json") flags.json = true;
    else if (arg.startsWith("--url=")) flags.url = arg.slice(6);
    else if (arg.startsWith("--only=")) flags.only = arg.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--batch=")) flags.batchSize = Number(arg.slice(8));
    else throw new MigrationError(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(flags.batchSize) || flags.batchSize < 1) {
    throw new MigrationError("--batch must be a positive integer");
  }
  return flags;
}

// ── Pure helpers (asserted by --self-check; no database) ────────────────────

export const quoteIdent = (name: string): string => `"${String(name).replace(/"/g, '""')}"`;

/** `public.businesses` / `"{{schema}}".agents` → a safely quoted reference. */
export function qualify(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

/**
 * Lowercased, trimmed email. Returns null for anything that cannot be a key —
 * mig.map_users joins on this, so a blank must not silently match another blank.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes("@") ? trimmed : null;
}

/**
 * V1 stores one free-text name; V3 wants first + last, both NOT NULL.
 * The last whitespace-separated token is the surname, everything before it the
 * given name(s). A single token has no surname — the caller decides what to put
 * there, this does not invent one.
 */
export function splitName(full: unknown): { first: string; last: string } {
  const tokens = typeof full === "string" ? full.trim().split(/\s+/).filter(Boolean) : [];
  if (tokens.length === 0) return { first: "", last: "" };
  if (tokens.length === 1) return { first: tokens[0], last: "" };
  return { first: tokens.slice(0, -1).join(" "), last: tokens[tokens.length - 1] };
}

/**
 * Canonical lookup key for a country written by a human.
 *
 * V1 stores countries as free text and is inconsistent about it: "India",
 * "INDIA", "  india ", "VIET NAM" vs "Viet Nam", plus bare ISO-2/ISO-3 codes.
 * Defect D7 is exactly this drift. Everything collapses to lowercase, single
 * spaces, no punctuation, so mig.map_countries can be a plain equality join.
 */
export function normalizeCountryKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key.length > 0 ? key : null;
}

/**
 * normalizeCountryKey(), expressed as SQL over an arbitrary expression.
 *
 * The resolver views and the transforms both join on this, and a geo key that
 * means one thing in SQL and another in TypeScript is exactly how a country
 * resolves in the importer and not in the gate. NFKD + stripping the combining
 * marks is the half that matters in practice: without it `São Paulo` and
 * `Sao Paulo` are different cities, and V1 accents every one of them.
 */
export const normKeySql = (expr: string): string =>
  `btrim(regexp_replace(regexp_replace(lower(normalize(${expr}, NFKD)), '[̀-ͯ]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))`;

/**
 * A DNS label for a tenant subdomain: lowercase alphanumerics and hyphens, no
 * leading or trailing hyphen, 63 characters max. Returns null when nothing
 * usable survives — a business with an unusable name needs a decision, not a
 * silently mangled subdomain.
 */
export function dnsLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return label.length > 0 ? label : null;
}

/**
 * The columns to write: present on both sides, minus anything the caller
 * refuses to carry. Convention 2 — the shape is discovered, not declared.
 */
export function intersectColumns(
  sourceColumns: Iterable<string>,
  targetColumns: ReadonlySet<string>,
  never: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (const c of sourceColumns) {
    if (targetColumns.has(c) && !never.has(c)) out.push(c);
  }
  return out.sort();
}

/** Source columns the target has no home for. Reported, never assumed harmless. */
export function unmappedColumns(
  sourceColumns: Iterable<string>,
  targetColumns: ReadonlySet<string>,
  never: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (const c of sourceColumns) {
    if (!targetColumns.has(c) && !never.has(c)) out.push(c);
  }
  return out.sort();
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new MigrationError("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * An idempotent natural-key upsert. `conflict` names the natural key; the
 * remaining columns are refreshed, so a second run converges rather than
 * duplicating — which is what lets W1 absorb the 24 users already in the DB
 * instead of creating shadow copies of them.
 */
export function buildUpsert(
  target: string,
  columns: readonly string[],
  conflict: readonly string[],
  rowCount: number,
): string {
  if (columns.length === 0) throw new MigrationError(`${target}: nothing to insert`);
  if (conflict.length === 0) throw new MigrationError(`${target}: an upsert needs a conflict target — a blind INSERT is not idempotent`);
  for (const c of conflict) {
    if (!columns.includes(c)) throw new MigrationError(`${target}: conflict column ${c} is not among the inserted columns`);
  }
  const cols = columns.map(quoteIdent).join(", ");
  const values = Array.from({ length: rowCount }, (_, r) =>
    `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(", ")})`,
  ).join(", ");
  const updates = columns.filter((c) => !conflict.includes(c));
  const action = updates.length
    ? `DO UPDATE SET ${updates.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(", ")}`
    : "DO NOTHING";
  return `INSERT INTO ${target} (${cols}) VALUES ${values} ON CONFLICT (${conflict.map(quoteIdent).join(", ")}) ${action}`;
}

/** The closed reason enum, read from mapping.json so there is one list, not two. */
export function reasonCodes(mapping: { meta?: { reasonCodes?: Record<string, unknown> } }): Set<string> {
  const codes = mapping.meta?.reasonCodes ?? {};
  return new Set(Object.keys(codes).filter((k) => !k.startsWith("$")));
}

// ── The `mig` schema: report table + resolver maps (Part 3 §5) ──────────────

/**
 * The report table. Every row a transform could not place lands here with a
 * reason code, so "what did not migrate, and why" is a query rather than a
 * memory. Gate 2 check 6 fails the whole gate on any row whose reason is not in
 * the closed enum.
 */
export const MIG_REPORT_SQL = `
CREATE SCHEMA IF NOT EXISTS ${quoteIdent(MIG_SCHEMA)};

CREATE TABLE IF NOT EXISTS ${MIG_SCHEMA}.unresolved (
  id           bigserial PRIMARY KEY,
  run_id       text        NOT NULL,
  wave         text        NOT NULL,
  source_table text        NOT NULL,
  source_key   text        NOT NULL,
  target_table text,
  column_name  text,
  reason_code  text        NOT NULL,
  detail       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unresolved_reason_idx ON ${MIG_SCHEMA}.unresolved (reason_code);
CREATE INDEX IF NOT EXISTS unresolved_run_idx    ON ${MIG_SCHEMA}.unresolved (run_id);
`;

/**
 * Resolver maps that need only the V3 side. Materialised as views so they can
 * never go stale between waves.
 */
export const MIG_TARGET_MAPS_SQL = (): string => `
-- V1 business uuid -> V3 businesses.id + the tenant schema that holds its data.
-- The uuid is stamped into businesses.meta at load time (§5), which is what
-- makes this a lookup rather than a guess.
CREATE OR REPLACE VIEW ${MIG_SCHEMA}.map_businesses AS
  SELECT (b.meta->>'v1_business_id')::uuid AS v1_business_id,
         b.id                              AS business_id,
         b.schema_name                     AS schema_name,
         b.subdomain                       AS subdomain
    FROM public.businesses b
   WHERE b.deleted_at IS NULL
     AND b.meta->>'v1_business_id' IS NOT NULL;

-- Institutions resolve on their natural key (name + country), because an
-- unclaimed institution has no V1 business row to point back at. Where one does
-- exist, v1_business_id carries it and both paths must agree.
CREATE OR REPLACE VIEW ${MIG_SCHEMA}.map_institutions AS
  SELECT ${normKeySql("i.institution_name")} AS name_key,
         i.country_id                     AS country_id,
         i.id                             AS institution_id,
         i.v1_business_id                 AS v1_business_id,
         i.schema_name                    AS schema_name,
         i.claim_status                   AS claim_status
    FROM public.institutions i
   WHERE i.deleted_at IS NULL
     AND btrim(coalesce(i.institution_name, '')) <> '';

-- Country resolution. ISO-2 is the canonical key; ISO-3 and the country name
-- resolve too, all through the same normalisation the runner's
-- normalizeCountryKey() applies in TypeScript, so SQL and TS cannot disagree.
-- Priority iso2 > iso3 > name keeps a name collision from shadowing a code.
CREATE OR REPLACE VIEW ${MIG_SCHEMA}.map_countries AS
  SELECT DISTINCT ON (key) key, id, priority
    FROM (
      SELECT ${normKeySql("c.iso2")} AS key, c.id, 1 AS priority
        FROM public.countries c WHERE c.iso2 IS NOT NULL
      UNION ALL
      SELECT ${normKeySql("c.iso3")}, c.id, 2
        FROM public.countries c WHERE c.iso3 IS NOT NULL
      UNION ALL
      SELECT ${normKeySql("c.name")}, c.id, 3
        FROM public.countries c WHERE c.name IS NOT NULL
    ) s
   WHERE key <> ''
   ORDER BY key, priority, id;

-- Cities are only unique within a country, so the key is the pair. Resolving a
-- city name alone is how you get a Sydney in Nova Scotia.
CREATE OR REPLACE VIEW ${MIG_SCHEMA}.map_cities AS
  SELECT c.country_id            AS country_id,
         ${normKeySql("c.name")} AS name_key,
         c.id                    AS city_id
    FROM public.cities c
   WHERE c.deleted_at IS NULL AND btrim(coalesce(c.name, '')) <> '';
`;

/**
 * The identity map. Keyed on email, per §5: V1's auth uuid is preserved in
 * platform_users.uuid, but email is the key that lets W1 CONVERGE onto the 24
 * users already migrated by hand instead of duplicating them. `matched_by`
 * makes a uuid/email disagreement visible rather than silently picking one.
 */
export const MIG_USER_MAP_SQL = `
CREATE OR REPLACE VIEW ${MIG_SCHEMA}.map_users AS
  SELECT u.id                                    AS v1_user_id,
         p.id                                    AS platform_user_id,
         lower(btrim(u.email))                   AS email,
         CASE WHEN p.uuid = u.id THEN 'email+uuid' ELSE 'email' END AS matched_by
    FROM ${STAGING_SCHEMA}.auth_users u
    JOIN public.platform_users p
      ON lower(btrim(p.email)) = lower(btrim(u.email))
   WHERE p.deleted_at IS NULL
     AND u.deleted_at IS NULL
     AND u.email IS NOT NULL
     AND btrim(u.email) <> '';
`;

/** Create the report table, and the resolver views whose inputs exist. */
export async function ensureMigSchema(db: pg.ClientBase): Promise<string[]> {
  const created: string[] = [];
  await db.query(MIG_REPORT_SQL);
  created.push(`${MIG_SCHEMA}.unresolved`);
  await db.query(MIG_TARGET_MAPS_SQL());
  created.push(`${MIG_SCHEMA}.map_businesses`, `${MIG_SCHEMA}.map_institutions`, `${MIG_SCHEMA}.map_countries`, `${MIG_SCHEMA}.map_cities`);

  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'auth_users'`,
    [STAGING_SCHEMA],
  );
  if (Number(rows[0].n) > 0) {
    await db.query(MIG_USER_MAP_SQL);
    created.push(`${MIG_SCHEMA}.map_users`);
  }
  return created;
}

// ── Runtime helpers ─────────────────────────────────────────────────────────

/** Column names of a live table. Convention 2: ask the database, don't declare. */
export async function tableColumns(db: pg.ClientBase, schema: string, table: string): Promise<Set<string>> {
  const { rows } = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND is_generated <> 'ALWAYS'`,
    [schema, table],
  );
  if (rows.length === 0) throw new MigrationError(`${schema}.${table} does not exist`);
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Record a source row the transform could not place. The reason code is checked
 * against mapping.json's closed enum here rather than at gate time, so an
 * unexplainable skip cannot be written in the first place.
 */
export async function reportUnresolved(
  ctx: TransformContext,
  entry: UnresolvedEntry,
  allowedCodes: ReadonlySet<string>,
): Promise<void> {
  if (!allowedCodes.has(entry.reasonCode)) {
    throw new MigrationError(
      `unknown reason code "${entry.reasonCode}" for ${entry.sourceTable}/${entry.sourceKey} — ` +
        `add it to mapping.json meta.reasonCodes with a definition, or use an existing one. ` +
        `An unexplained skip is a red gate (Gate 2 check 6).`,
    );
  }
  ctx.report.unresolved.push(entry);
  await ctx.db.query(
    `INSERT INTO ${MIG_SCHEMA}.unresolved (run_id, wave, source_table, source_key, target_table, column_name, reason_code, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ctx.runId,
      ctx.wave,
      entry.sourceTable,
      entry.sourceKey,
      entry.targetTable ?? null,
      entry.column ?? null,
      entry.reasonCode,
      entry.detail ?? null,
    ],
  );
}

/**
 * Defect D8. A junction row is meaningless unless both of its parents are
 * already present, and `ON CONFLICT DO NOTHING` will happily swallow the ones
 * whose parents are not — turning an ordering bug into a silent orphan that
 * surfaces months later as a missing fee or a course with no campus.
 *
 * So before a junction loads, every declared parent must reconcile: staged rows
 * == written rows + rows this run already reported as unresolved. Anything else
 * throws, and the whole transaction rolls back.
 */
export async function assertParentCounts(
  ctx: TransformContext,
  junction: string,
  parents: readonly { label: string; stagingTable: string; targetTable: string; targetFilter?: string }[],
): Promise<void> {
  const problems: string[] = [];
  for (const parent of parents) {
    const { rows: src } = await ctx.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${qualify(STAGING_SCHEMA, parent.stagingTable)}`,
    );
    const { rows: tgt } = await ctx.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${parent.targetTable}${parent.targetFilter ? ` WHERE ${parent.targetFilter}` : ""}`,
    );
    const { rows: skipped } = await ctx.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${MIG_SCHEMA}.unresolved WHERE run_id = $1 AND source_table = $2`,
      [ctx.runId, parent.stagingTable],
    );
    const staged = Number(src[0].n);
    const written = Number(tgt[0].n);
    const explained = Number(skipped[0].n);
    if (written + explained < staged) {
      problems.push(
        `${parent.label}: ${staged} staged, ${written} written, ${explained} reported — ` +
          `${staged - written - explained} rows unaccounted for`,
      );
    }
  }
  if (problems.length) {
    throw new MigrationError(
      `junction ${junction} refused to load — its parents do not reconcile (defect D8):\n  ${problems.join("\n  ")}`,
    );
  }
}

/** Batched idempotent upsert. Returns the number of rows sent. */
export async function upsertRows(
  ctx: TransformContext,
  target: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  conflict: readonly string[],
): Promise<number> {
  let sent = 0;
  for (const batch of chunk(rows, ctx.batchSize)) {
    const sql = buildUpsert(target, columns, conflict, batch.length);
    const params = batch.flatMap((row) => columns.map((c) => row[c] ?? null));
    await ctx.db.query(sql, params);
    sent += batch.length;
  }
  ctx.report.written[target] = (ctx.report.written[target] ?? 0) + sent;
  return sent;
}

/**
 * Run one set-based write (INSERT … SELECT … ON CONFLICT) and account for it.
 *
 * Convention 3 lives in the SQL: every statement passed here carries its own
 * `ON CONFLICT (<natural key>) DO UPDATE`, so a second run converges on the rows
 * the first one wrote instead of duplicating them. The row count lands in the
 * report under `label`, which is what makes "rows in → rows out" arithmetic
 * rather than narration.
 *
 * Set-based rather than row-by-row on purpose: the whole wave is one statement
 * per target, which is both the batching convention and the only way the
 * dry-run rehearsal hits the same constraint checks the apply will.
 */
export async function execWrite(
  ctx: TransformContext,
  label: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const res = await ctx.db.query(sql, params as unknown[]);
  const n = res.rowCount ?? 0;
  ctx.report.written[label] = (ctx.report.written[label] ?? 0) + n;
  return n;
}

/**
 * Drop this wave's previous verdict on the tables it is about to re-read.
 *
 * Convention 3 applies to the report as much as to the data: without this, a
 * second run appends a second copy of every skip and "what did not migrate" stops
 * being a count. Scoped to the named source tables so one wave never erases
 * another's findings.
 */
export async function clearReport(ctx: TransformContext, sourceTables: readonly string[]): Promise<number> {
  if (sourceTables.length === 0) return 0;
  const res = await ctx.db.query(
    `DELETE FROM ${MIG_SCHEMA}.unresolved WHERE source_table = ANY($1::text[])`,
    [[...sourceTables]],
  );
  return res.rowCount ?? 0;
}

/**
 * Reason-code a whole class of skips in one statement (convention 4).
 *
 * `sql` must return exactly two columns: the source row key and a free-text
 * detail. The reason code is checked against mapping.json's closed enum before
 * anything is written, so an unexplainable skip cannot reach the report table in
 * the first place — Gate 2 check 6 treats "unexplained" as red.
 */
export async function reportUnresolvedQuery(
  ctx: TransformContext,
  allowedCodes: ReadonlySet<string>,
  spec: {
    sourceTable: string;
    targetTable?: string | null;
    column?: string | null;
    reasonCode: string;
    sql: string;
    params?: readonly unknown[];
  },
): Promise<number> {
  if (!allowedCodes.has(spec.reasonCode)) {
    throw new MigrationError(
      `unknown reason code "${spec.reasonCode}" for ${spec.sourceTable} — ` +
        `add it to mapping.json meta.reasonCodes with a definition, or use an existing one.`,
    );
  }
  const head = [ctx.runId, ctx.wave, spec.sourceTable, spec.targetTable ?? null, spec.column ?? null, spec.reasonCode];
  const res = await ctx.db.query(
    `INSERT INTO ${MIG_SCHEMA}.unresolved (run_id, wave, source_table, target_table, column_name, reason_code, source_key, detail)
     SELECT $1, $2, $3, $4, $5, $6, s.key::text, s.detail::text FROM (${spec.sql}) s(key, detail)`,
    [...head, ...(spec.params ?? [])],
  );
  const n = res.rowCount ?? 0;
  for (let i = 0; i < n; i += 1) {
    ctx.report.unresolved.push({
      sourceTable: spec.sourceTable,
      sourceKey: "(set-based)",
      targetTable: spec.targetTable ?? null,
      column: spec.column ?? null,
      reasonCode: spec.reasonCode,
    });
  }
  return n;
}

/**
 * Convention 2 as a guard: every column a transform writes must exist on the
 * live target. A renamed column then fails loudly at the top of the wave instead
 * of silently not being written — which is exactly how the hand-written
 * importers lost 24 columns.
 */
export async function assertTargetColumns(
  db: pg.ClientBase,
  schema: string,
  table: string,
  columns: readonly string[],
): Promise<void> {
  const live = await tableColumns(db, schema, table);
  const missing = columns.filter((c) => !live.has(c));
  if (missing.length) {
    throw new MigrationError(
      `${schema}.${table} has no column(s): ${missing.join(", ")} — the transform and the schema have drifted`,
    );
  }
}

// ── The runner ──────────────────────────────────────────────────────────────

/**
 * Run one wave's transform inside a single transaction.
 *
 * Dry-run and --apply execute the same statements in the same order; the last
 * one is ROLLBACK or COMMIT. That is the entire difference, deliberately, so a
 * green dry run means the apply has already been rehearsed against real data —
 * including the constraint violations a SELECT-only rehearsal would never hit.
 */
export async function runTransform(
  options: {
    wave: string;
    argv?: readonly string[];
    connectionString?: string;
    body: (ctx: TransformContext, allowedCodes: ReadonlySet<string>) => Promise<void>;
    /** Extra pure-helper assertions this script owns, run after the shared ones. */
    selfCheck?: () => void;
  },
): Promise<number> {
  let flags: RunnerFlags;
  try {
    flags = parseRunnerArgs(options.argv ?? process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  if (flags.selfCheck) {
    try {
      selfCheck();
      options.selfCheck?.();
      return 0;
    } catch (err) {
      console.error(`self-check FAILED: ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
  }

  const url = flags.url ?? options.connectionString ?? process.env.V3_DATABASE_URL ?? null;
  if (!url) {
    console.error("set --url= or V3_DATABASE_URL — the V3 database holding v1_staging");
    return 2;
  }

  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8")) as { meta?: { reasonCodes?: Record<string, unknown> } };
  const allowedCodes = reasonCodes(mapping);

  const runId = `${options.wave}-${new Date().toISOString()}`;
  const report: RunReport = { runId, wave: options.wave, apply: flags.apply, written: {}, unresolved: [], notes: [] };

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const ctx: TransformContext = { db, apply: flags.apply, wave: options.wave, runId, batchSize: flags.batchSize, report };

  let failure: unknown = null;
  try {
    await db.query("BEGIN");
    report.notes.push(...(await ensureMigSchema(db)).map((v) => `ensured ${v}`));
    await options.body(ctx, allowedCodes);
    // The one and only difference between a dry run and an apply.
    await db.query(flags.apply ? "COMMIT" : "ROLLBACK");
  } catch (err) {
    failure = err;
    await db.query("ROLLBACK").catch(() => {});
  } finally {
    await db.end().catch(() => {});
  }

  if (flags.json) {
    console.log(JSON.stringify({ ...report, error: failure ? String((failure as Error).message ?? failure) : null }, null, 2));
  } else {
    console.log(`${options.wave} — ${flags.apply ? "APPLY (committed)" : "DRY RUN (rolled back; identical code path)"}`);
    for (const [t, n] of Object.entries(report.written)) console.log(`  wrote  ${t}: ${n} rows`);
    if (report.unresolved.length) {
      const byReason = new Map<string, number>();
      for (const u of report.unresolved) byReason.set(u.reasonCode, (byReason.get(u.reasonCode) ?? 0) + 1);
      console.log(`  reported ${report.unresolved.length} unresolved row(s) to ${MIG_SCHEMA}.unresolved:`);
      for (const [code, n] of [...byReason].sort()) console.log(`    ${code}: ${n}`);
    }
    if (failure) console.error(`  FAILED — ${(failure as Error).message ?? failure}`);
    if (!flags.apply) console.log(`  Nothing was written. Re-run with --apply to commit.`);
  }
  return failure ? 1 : 0;
}

// ── Self-check ──────────────────────────────────────────────────────────────

export function selfCheck(): void {
  assert.equal(quoteIdent("t"), '"t"');
  assert.equal(qualify("v1_staging", "auth_users"), '"v1_staging"."auth_users"');

  assert.equal(normalizeEmail("  Amit@Example.COM "), "amit@example.com");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("not-an-email"), null, "a blank-ish value must not become a join key");
  assert.equal(normalizeEmail(null), null);

  assert.deepEqual(splitName("Amit Ranjit Kar"), { first: "Amit Ranjit", last: "Kar" });
  assert.deepEqual(splitName("  Prince  "), { first: "Prince", last: "" });
  assert.deepEqual(splitName(""), { first: "", last: "" });
  assert.deepEqual(splitName(null), { first: "", last: "" });

  // Defect D7 — the country drift that actually exists in V1.
  assert.equal(normalizeCountryKey("India"), "india");
  assert.equal(normalizeCountryKey("INDIA"), "india");
  assert.equal(normalizeCountryKey("  india "), "india");
  assert.equal(normalizeCountryKey("VIET NAM"), "viet nam");
  assert.equal(normalizeCountryKey("Viet Nam"), "viet nam");
  assert.equal(normalizeCountryKey("viet-nam"), "viet nam");
  assert.equal(normalizeCountryKey("AU"), "au");
  assert.equal(normalizeCountryKey("AUS"), "aus");
  assert.equal(normalizeCountryKey("Côte d'Ivoire"), "cote d ivoire");
  assert.equal(normalizeCountryKey("   "), null);
  assert.equal(normalizeCountryKey(undefined), null);

  assert.equal(dnsLabel("Asia Pacific International College"), "asia-pacific-international-college");
  assert.equal(dnsLabel("--Acme--"), "acme");
  assert.equal(dnsLabel("!!!"), null, "an unusable name needs a decision, not a mangled subdomain");
  assert.equal(dnsLabel("x".repeat(80))!.length, 63);
  assert.ok(!dnsLabel("a".repeat(62) + "-b")!.endsWith("-"), "truncation must not leave a trailing hyphen");

  const target = new Set(["id", "name", "email"]);
  assert.deepEqual(intersectColumns(["email", "name", "gone"], target), ["email", "name"]);
  assert.deepEqual(intersectColumns(["email", "name"], target, new Set(["email"])), ["name"]);
  assert.deepEqual(unmappedColumns(["email", "legacy_flag"], target), ["legacy_flag"]);
  assert.deepEqual(unmappedColumns(["legacy_flag"], target, new Set(["legacy_flag"])), []);

  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  assert.throws(() => chunk([1], 0), /chunk size/);

  const sql = buildUpsert('"public"."platform_users"', ["email", "first_name"], ["email"], 2);
  assert.match(sql, /VALUES \(\$1, \$2\), \(\$3, \$4\)/);
  assert.match(sql, /ON CONFLICT \("email"\) DO UPDATE SET "first_name" = EXCLUDED\."first_name"/);
  // A single-column upsert has nothing to update; DO NOTHING is still idempotent.
  assert.match(buildUpsert('"t"', ["k"], ["k"], 1), /DO NOTHING/);
  // A blind insert is not idempotent, and a conflict target that is not being
  // inserted cannot fire — both are refused rather than producing duplicates.
  assert.throws(() => buildUpsert('"t"', ["a"], [], 1), /not idempotent/);
  assert.throws(() => buildUpsert('"t"', ["a"], ["b"], 1), /not among the inserted columns/);

  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8")) as { meta?: { reasonCodes?: Record<string, unknown> } };
  const codes = reasonCodes(mapping);
  assert.ok(codes.size >= 10, "mapping.json must define the closed reason enum");
  assert.ok(codes.has("unresolved_user") && codes.has("unresolved_business"));
  assert.ok(!codes.has("$comment"), "documentation keys are not reason codes");

  assert.deepEqual(parseRunnerArgs([]).apply, false, "dry-run is the default");
  assert.deepEqual(parseRunnerArgs(["--apply"]).apply, true);
  assert.throws(() => parseRunnerArgs(["--nope"]), /unknown argument/);
  assert.throws(() => parseRunnerArgs(["--batch=0"]), /positive integer/);

  console.log(`self-check: ok — ${codes.size} reason codes, pure helpers verified`);
}

// ── CLI entry ───────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const flags = parseRunnerArgs(process.argv.slice(2));
  if (flags.selfCheck) {
    selfCheck();
    return 0;
  }
  if (flags.ensureMig) {
    return runTransform({
      wave: "W0-ensure-mig",
      body: async (ctx) => {
        ctx.report.notes.push("mig schema and resolver views ensured");
      },
    });
  }
  console.error("nothing to do: pass --self-check or --ensure-mig [--apply]");
  return 2;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
