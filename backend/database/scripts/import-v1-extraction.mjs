// Loads the V1 scraped course/institution/agent corpus (~100k rows) into
// superadmin.extraction_* on V3.
//
//   node database/scripts/import-v1-extraction.mjs                # dry run (default)
//   node database/scripts/import-v1-extraction.mjs --apply        # write
//   node database/scripts/import-v1-extraction.mjs --with-events  # also load extraction_job_events
//   node database/scripts/import-v1-extraction.mjs --self-check   # pure-fn asserts, no DB
//
// V3 kept V1's uuid primary keys on every extraction table, so identity carries
// over verbatim: the upsert conflict target IS the preserved V1 id, and a re-run
// updates in place and inserts zero. Everything moves as text and is cast back to
// the V3 column's exact type, which keeps jsonb / vector / text[] / enums honest.
//
// The whole load is one transaction. Each table asserts its target count against
// the source count before the next one starts, because a junction row references
// two remapped parents and ON CONFLICT DO NOTHING would turn a missing parent
// into a silent orphan instead of an FK error.
//
// V1_DATABASE_URL must point at the V1 source; V3 defaults to backend/.env.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

import {
  EVENTS_TABLE,
  EXCLUDED_TABLES,
  LOAD_PLAN,
  buildSelect,
  buildUpsert,
  chunk,
  missingParents,
  normalizeCountry,
  rowsPerStatement,
  textToJsonb,
  vectorWidth,
} from "./extraction-transforms.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../..");
// Always "public" against the real V1 dump; overridable so the integration tests
// can stand a V1-shaped fixture up in a schema of their own.
const V1_SCHEMA = process.env.V1_SCHEMA || "public";
const V3_SCHEMA = "superadmin";

// ── DB plumbing (mirrors import-v1-users.mjs) ───────────────────────────────

function v3UrlFromEnv() {
  if (process.env.V3_DATABASE_URL) return process.env.V3_DATABASE_URL;
  dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });
  const { DB_USERNAME, DB_PASSWORD, DB_NAME, DB_HOST = "localhost", DB_PORT = "5432" } = process.env;
  if (!DB_USERNAME || !DB_NAME) return null;
  const auth = `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD ?? "")}`;
  return `postgresql://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

async function connect(connectionString, label, { readOnly = false } = {}) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`, { cause: err });
  }
  if (readOnly) await client.query("SET default_transaction_read_only = on");
  return client;
}

// ── Catalog introspection ───────────────────────────────────────────────────

/** table -> [{ name, type }] in V3 ordinal order, `type` from format_type(). */
async function describeSchema(client, schema) {
  const { rows } = await client.query(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [schema],
  );
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.table_name)) out.set(r.table_name, []);
    out.get(r.table_name).push({ name: r.column_name, type: r.type });
  }
  return out;
}

/** Columns present on both sides, ordered as V3 declares them. */
function sharedColumns(v3Cols, v1Cols) {
  const v1Names = new Set(v1Cols.map((c) => c.name));
  return v3Cols.filter((c) => v1Names.has(c.name));
}

async function idSet(v3, table, key = "id") {
  const { rows } = await v3.query(`SELECT "${key}"::text AS k FROM "${V3_SCHEMA}"."${table}"`);
  return new Set(rows.map((r) => r.k));
}

// ── Reference resolvers (the columns that are NOT a straight copy) ──────────

/** uuid -> lower(name) from a V1 reference table. */
async function v1NameByUuid(v1, table) {
  const { rows } = await v1.query(`SELECT id::text AS id, name FROM "${V1_SCHEMA}"."${table}"`);
  return new Map(rows.map((r) => [r.id, (r.name ?? "").trim().toLowerCase()]));
}

/** lower(name) -> id::text from a V3 reference table. */
async function v3IdByName(v3, schema, table) {
  const { rows } = await v3.query(`SELECT id::text AS id, name FROM "${schema}"."${table}"`);
  return new Map(rows.map((r) => [(r.name ?? "").trim().toLowerCase(), r.id]));
}

/**
 * V1 uuid -> V3 id, matched on name. Unresolved values are reported and stored
 * as NULL rather than failing the load: B1 owns these reference tables and may
 * land after this script runs.
 */
function makeReferenceResolver({ label, v1Names, v3Ids, report }) {
  return (uuid) => {
    if (!uuid) return null;
    const name = v1Names.get(uuid);
    if (!name) {
      report.unresolvedReferences.push({ label, uuid, reason: "no such row in V1" });
      return null;
    }
    const id = v3Ids.get(name);
    if (id === undefined) {
      report.unresolvedReferences.push({ label, uuid, name, reason: "no V3 row with that name" });
      return null;
    }
    return id;
  };
}

/**
 * Per-column overrides, built once against live catalog + reference data.
 * Key is `table.column`; value is (textValue) => replacement text or null.
 */
async function buildTransforms({ v1, v3, v3Schema, v1Schema, report }) {
  const transforms = new Map();

  const businessCats = makeReferenceResolver({
    label: "extraction_jobs.business_category_id",
    v1Names: await v1NameByUuid(v1, "business_categories"),
    v3Ids: await v3IdByName(v3, "public", "business_categories"),
    report,
  });
  const serviceCats = makeReferenceResolver({
    label: "extraction_jobs.service_category_id",
    v1Names: await v1NameByUuid(v1, "service_categories"),
    v3Ids: await v3IdByName(v3, "public", "service_categories"),
    report,
  });
  const feeTypes = makeReferenceResolver({
    label: "extraction_course_fees.fee_type_id",
    v1Names: await v1NameByUuid(v1, "fee_types"),
    // Reference vocabularies live in public, like the two resolvers above. The
    // superadmin copies were an abandoned placeholder; reading them here is what
    // left 718 fee_type_id NULL.
    v3Ids: await v3IdByName(v3, "public", "fee_types"),
    report,
  });
  const degreeLevels = makeReferenceResolver({
    label: "extraction_eligibility_requirements.degree_level_id",
    v1Names: await v1NameByUuid(v1, "degree_levels"),
    v3Ids: await v3IdByName(v3, "public", "degree_levels"),
    report,
  });

  transforms.set("extraction_jobs.business_category_id", businessCats);
  transforms.set("extraction_jobs.service_category_id", serviceCats);
  transforms.set("extraction_course_fees.fee_type_id", feeTypes);
  transforms.set("extraction_eligibility_requirements.degree_level_id", degreeLevels);

  // Free text in V3 too, but V1 shouts half of it and truncated some of it.
  transforms.set("extraction_agents.country", (value) => {
    const { value: next, changed, reason } = normalizeCountry(value);
    if (changed || reason) report.countryChanges.push({ from: value, to: next, reason });
    return next;
  });

  // V1 typed these text and filled them with prose; V3 typed them jsonb.
  for (const col of ["domestic_fee_installments", "international_fee_installments"]) {
    transforms.set(`extraction_courses.${col}`, (value) => {
      const { value: next, coerced } = textToJsonb(value);
      if (coerced && value !== null) report.jsonCoercions.push({ column: col, value });
      return next;
    });
  }

  // pgvector on both sides — verify the declared width actually matches before
  // trusting the round-trip. A mismatch is a schema bug, not a data bug: NULL the
  // column, keep the row, and shout about it in the summary.
  const dims = (cols) => vectorWidth(cols?.find((c) => c.name === "embedding")?.type);
  const v1Dim = dims(v1Schema.get("extraction_memory"));
  const v3Dim = dims(v3Schema.get("extraction_memory"));
  if (v1Dim && v3Dim && v1Dim !== v3Dim) {
    report.schemaBlockers.push(
      `superadmin.extraction_memory.embedding is vector(${v3Dim}) but V1 is vector(${v1Dim}) — ` +
        `embeddings loaded as NULL. Fix the B2 migration to vector(${v1Dim}) and re-run.`,
    );
    transforms.set("extraction_memory.embedding", () => null);
  }

  return transforms;
}

// ── Loading one table ───────────────────────────────────────────────────────

async function loadTable({ v1, v3, spec, columns, parentIds, transforms, report }) {
  const started = Date.now();
  const { table } = spec;
  const conflictKey = spec.conflictKey ?? ["id"];
  const names = columns.map((c) => c.name);
  const types = columns.map((c) => c.type);

  const { rows: countRows } = await v1.query(`SELECT count(*)::int AS n FROM "${V1_SCHEMA}"."${table}"`);
  const sourceCount = countRows[0].n;

  const { rows: source } = await v1.query(buildSelect(V1_SCHEMA, table, names, conflictKey[0]));

  // Apply per-column transforms, then drop (loudly) any row whose parent is absent.
  const columnTransforms = names.map((n) => transforms.get(`${table}.${n}`) ?? null);
  const parentColumns = Object.entries(spec.parents ?? {});
  const payload = [];
  let skipped = 0;

  for (const row of source) {
    let orphaned = null;
    for (const [column, parentTable] of parentColumns) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      if (!parentIds.get(parentTable).has(value)) {
        orphaned = { column, parentTable, value };
        break;
      }
    }
    if (orphaned) {
      skipped += 1;
      report.orphans.push({ table, id: row[conflictKey[0]], ...orphaned });
      continue;
    }
    payload.push(names.map((n, i) => (columnTransforms[i] ? columnTransforms[i](row[n]) : row[n])));
  }

  const perStatement = rowsPerStatement(names.length);
  let inserted = 0;
  for (const batch of chunk(payload, perStatement)) {
    const sql = buildUpsert({
      schema: V3_SCHEMA,
      table,
      columns: names,
      types,
      conflictKey,
      rowCount: batch.length,
    });
    const { rows: result } = await v3.query(sql, batch.flat());
    inserted += result.filter((r) => r.inserted).length;
  }

  const { rows: targetRows } = await v3.query(`SELECT count(*)::int AS n FROM "${V3_SCHEMA}"."${table}"`);
  const targetCount = targetRows[0].n;

  // THE assertion. A short parent is what turns a later junction into silent
  // orphans, so it aborts the whole transaction rather than carrying on.
  const expected = sourceCount - skipped;
  if (targetCount !== expected) {
    throw new Error(
      `${table}: count assertion failed — source ${sourceCount} minus ${skipped} skipped = ${expected}, ` +
        `but superadmin.${table} holds ${targetCount}. Aborting before dependent tables load.`,
    );
  }

  const ms = Date.now() - started;
  report.tables.push({ table, sourceCount, targetCount, inserted, updated: payload.length - inserted, skipped, ms });
  console.log(
    `  ${table.padEnd(46)} ${String(sourceCount).padStart(6)} -> ${String(targetCount).padStart(6)}` +
      `  (+${inserted} new, ${skipped} skipped, ${ms}ms)`,
  );
  return { skipped, sourceCount };
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(normalizeCountry("INDIA").value, "India");
  assert.equal(normalizeCountry("India").value, "India");
  assert.equal(normalizeCountry("VIET NAM").value, "Vietnam");
  assert.equal(normalizeCountry("PHILIPPINES (THE)").value, "Philippines");
  assert.equal(normalizeCountry("KOREA (THE REPUBLIC OF)").value, "South Korea");
  assert.equal(normalizeCountry("Lao People's Democratic Republic").value, "Laos");
  assert.equal(normalizeCountry("PAPUA NEW GUINEA").value, "Papua New Guinea");
  assert.equal(normalizeCountry("QLD").value, "QLD");
  assert.equal(normalizeCountry("Bangladesh; India; Sri Lanka").value, "Bangladesh; India; Sri Lanka");
  assert.equal(normalizeCountry(null).value, null);
  assert.equal(normalizeCountry("  ").value, null);
  assert.equal(normalizeCountry("India").changed, false);

  assert.equal(textToJsonb(null).value, null);
  assert.equal(textToJsonb('{"a":1}').coerced, false);
  assert.equal(textToJsonb("5 installments").value, '"5 installments"');
  assert.equal(textToJsonb("5").value, '"5"');

  assert.equal(rowsPerStatement(30, 30_000), 1000);
  assert.equal(rowsPerStatement(40_000, 30_000), 1);
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);

  const upsert = buildUpsert({
    schema: "superadmin",
    table: "extraction_jobs",
    columns: ["id", "name"],
    types: ["uuid", "text"],
    conflictKey: ["id"],
    rowCount: 2,
  });
  assert.match(upsert, /\$1::uuid, \$2::text\), \(\$3::uuid, \$4::text\)/);
  assert.match(upsert, /ON CONFLICT \("id"\) DO UPDATE SET "name" = EXCLUDED\."name"/);
  assert.throws(() => buildUpsert({ schema: "s", table: "t; DROP TABLE x", columns: ["id"], types: ["uuid"], conflictKey: ["id"], rowCount: 1 }));

  assert.deepEqual(missingParents({ parents: { job_id: "extraction_jobs" } }, new Set()), ["extraction_jobs"]);
  assert.deepEqual(missingParents({ parents: {} }, new Set()), []);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) return selfCheck();

  const apply = args.includes("--apply");
  const withEvents = args.includes("--with-events");

  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("V1_DATABASE_URL is not set (the restored V1 database).");
    process.exit(2);
  }
  const v3Url = v3UrlFromEnv();
  if (!v3Url) {
    console.error("No V3 connection: set V3_DATABASE_URL or DB_USERNAME/DB_NAME in backend/.env");
    process.exit(2);
  }

  const report = {
    tables: [],
    orphans: [],
    countryChanges: [],
    jsonCoercions: [],
    unresolvedReferences: [],
    schemaBlockers: [],
    droppedColumns: [],
  };
  let v1, v3;
  const started = Date.now();

  try {
    v1 = await connect(v1Url, "V1", { readOnly: true });
    v3 = await connect(v3Url, "V3");

    const v1Schema = await describeSchema(v1, V1_SCHEMA);
    const v3Schema = await describeSchema(v3, V3_SCHEMA);
    const transforms = await buildTransforms({ v1, v3, v1Schema, v3Schema, report });

    const plan = withEvents ? [...LOAD_PLAN, EVENTS_TABLE] : LOAD_PLAN;
    const parentTables = new Set(plan.flatMap((s) => Object.values(s.parents ?? {})));

    console.log(apply ? "mode: APPLY (writing)" : "mode: DRY RUN (rolled back)");
    console.log(`tables: ${plan.length}${withEvents ? " (including extraction_job_events)" : ""}\n`);

    await v3.query("BEGIN");

    const verified = new Set();
    const parentIds = new Map();

    for (const spec of plan) {
      const missing = missingParents(spec, verified);
      if (missing.length) {
        throw new Error(`${spec.table}: parents not loaded/verified yet: ${missing.join(", ")}. Load order is wrong.`);
      }

      const v3Cols = v3Schema.get(spec.table);
      const v1Cols = v1Schema.get(spec.table);
      if (!v3Cols) throw new Error(`${spec.table}: missing from superadmin schema`);
      if (!v1Cols) throw new Error(`${spec.table}: missing from the V1 source`);
      const columns = sharedColumns(v3Cols, v1Cols);
      for (const c of v1Cols) {
        if (!columns.some((k) => k.name === c.name)) report.droppedColumns.push(`${spec.table}.${c.name} (V1 only)`);
      }

      const { skipped } = await loadTable({ v1, v3, spec, columns, parentIds, transforms, report });

      // A parent that lost rows would poison every junction below it.
      if (parentTables.has(spec.table) && skipped > 0) {
        throw new Error(`${spec.table}: ${skipped} rows skipped, but dependent tables reference it. Aborting.`);
      }
      verified.add(spec.table);
      if (parentTables.has(spec.table)) parentIds.set(spec.table, await idSet(v3, spec.table));
    }

    await v3.query(apply ? "COMMIT" : "ROLLBACK");

    // ── Summary ─────────────────────────────────────────────────────────────
    const totals = report.tables.reduce(
      (a, t) => ({ source: a.source + t.sourceCount, target: a.target + t.targetCount, inserted: a.inserted + t.inserted }),
      { source: 0, target: 0, inserted: 0 },
    );
    console.log(`\ntotal: ${totals.source} source -> ${totals.target} target (${totals.inserted} newly inserted)`);
    console.log(`wall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);

    console.log("\nnot migrated (deliberate):");
    for (const [t, why] of Object.entries(EXCLUDED_TABLES)) {
      if (t === "extraction_job_events" && withEvents) continue;
      console.log(`  ${t}: ${why}`);
    }

    if (report.schemaBlockers.length) {
      console.log("\n!! SCHEMA BLOCKERS (data was NOT fully carried):");
      for (const b of report.schemaBlockers) console.log(`  ${b}`);
    }
    if (report.unresolvedReferences.length) {
      const byLabel = new Map();
      for (const r of report.unresolvedReferences) {
        const k = `${r.label} :: ${r.reason}${r.name ? ` (${r.name})` : ""}`;
        byLabel.set(k, (byLabel.get(k) ?? 0) + 1);
      }
      console.log("\n!! UNRESOLVED REFERENCES — stored as NULL, re-run after B1 lands its reference data:");
      for (const [k, n] of byLabel) console.log(`  ${n.toLocaleString()} x ${k}`);
    }
    if (report.orphans.length) {
      const byTable = new Map();
      for (const o of report.orphans) {
        const k = `${o.table}.${o.column} -> ${o.parentTable}`;
        byTable.set(k, (byTable.get(k) ?? 0) + 1);
      }
      console.log("\n!! SKIPPED ROWS (parent missing — reported, never silently dropped):");
      for (const [k, n] of byTable) console.log(`  ${n} x ${k}`);
      for (const o of report.orphans.slice(0, 20)) console.log(`     ${o.table} id=${o.id} ${o.column}=${o.value}`);
      if (report.orphans.length > 20) console.log(`     ... and ${report.orphans.length - 20} more`);
    }
    if (report.jsonCoercions.length) {
      console.log(`\ntext -> jsonb coercions (V1 prose wrapped as a JSON string): ${report.jsonCoercions.length}`);
      for (const c of report.jsonCoercions) console.log(`  ${c.column}: ${JSON.stringify(c.value).slice(0, 100)}`);
    }
    if (report.countryChanges.length) {
      const byPair = new Map();
      for (const c of report.countryChanges) {
        const k = `${c.from} -> ${c.to}${c.reason ? `  [${c.reason}]` : ""}`;
        byPair.set(k, (byPair.get(k) ?? 0) + 1);
      }
      console.log(`\nextraction_agents.country normalisations (${report.countryChanges.length} rows, ${byPair.size} distinct):`);
      for (const [k, n] of [...byPair].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} x ${k}`);
    }
    if (report.droppedColumns.length) {
      console.log(`\nV1 columns with no V3 home (not copied): ${report.droppedColumns.join(", ")}`);
    }
    if (!apply) console.log("\nnothing was written — re-run with --apply");
  } catch (err) {
    if (v3) await v3.query("ROLLBACK").catch(() => {});
    console.error(`\nimport failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await v1?.end().catch(() => {});
    await v3?.end().catch(() => {});
  }
}

await main();
