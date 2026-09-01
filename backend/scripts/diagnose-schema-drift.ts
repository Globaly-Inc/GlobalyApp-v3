/**
 * Read-only schema drift report.
 *
 *   node --import tsx scripts/diagnose-schema-drift.ts
 *
 * Knex records a migration as run by FILENAME. When a migration file is edited in place after
 * it has already run — which 31 files in this repo have been — the record stays satisfied and
 * the edit never reaches an existing database. The code then expects columns that are only
 * present on databases created after the edit. That is how
 * `column "originator_id" of relation "business_representations" does not exist` happens on a
 * migration that `migrate:latest` reports as fully up to date.
 *
 * This script compares the columns the migration FILES describe against the columns the
 * DATABASE actually has, for the globalyapp and superadmin schemas plus every provisioned
 * tenant schema.
 *
 * Writes nothing: information_schema and the knex bookkeeping tables, SELECT only.
 *
 * Known blind spot: columns added through `knex.raw("ALTER TABLE ...")` are not parsed out of
 * the files, so they surface under "in DB but not in files" rather than being matched. Treat
 * MISSING as the actionable list; EXTRA is mostly raw-SQL migrations and is informational.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { masterKnex } from "../src/core/db/master-pool.js";

type Expected = Map<string, Set<string>>; // "schema.table" -> columns

const MIGRATION_ROOT = "database/migrations";

/**
 * Pulls table/column shape out of a migration file's source.
 *
 * A deliberately shallow parser: it walks createTable/alterTable blocks by brace depth and
 * records `t.<type>("col")` and `dropColumn("col")`. That covers the knex-builder style every
 * file here is written in, and nothing else — see the raw-SQL blind spot above.
 */
function parseMigration(src: string, defaultSchema: string, expected: Expected) {
  const blockRe = /\.(createTable|alterTable)\(\s*["'`]([\w.]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    // `.withSchema("superadmin").createTable(...)` puts the table somewhere other than this
    // directory's default schema. Missing this reported superadmin's feature_flags and
    // site_access_settings as absent from public, which is a false alarm of exactly the kind
    // that makes a drift report useless.
    const prefix = src.slice(Math.max(0, m.index - 120), m.index);
    const withSchema = /\.withSchema\(\s*["'`](\w+)["'`]\s*\)\s*$/.exec(prefix);
    const key = `${withSchema ? withSchema[1] : defaultSchema}.${m[2]!}`;
    const cols = expected.get(key) ?? new Set<string>();

    // Walk from the match to the end of its callback body, tracking brace depth so a nested
    // closure (a join callback, say) does not end the block early.
    let i = src.indexOf("{", m.index);
    if (i === -1) continue;
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    const body = src.slice(start, i);

    for (const c of body.matchAll(/\bt\.\w+\(\s*["'`](\w+)["'`]/g)) cols.add(c[1]!);
    // timestamps(true, true) is created_at + updated_at.
    if (/\bt\.timestamps\(/.test(body)) { cols.add("created_at"); cols.add("updated_at"); }
    for (const d of body.matchAll(/dropColumn\(\s*["'`](\w+)["'`]/g)) cols.delete(d[1]!);

    expected.set(key, cols);
  }
}

function expectedFor(dir: string, defaultSchema: string): Expected {
  const expected: Expected = new Map();
  const files = readdirSync(join(MIGRATION_ROOT, dir)).filter((f) => f.endsWith(".ts")).sort();
  for (const f of files) {
    const src = readFileSync(join(MIGRATION_ROOT, dir, f), "utf8");
    // up() only. down() mirrors up() with dropColumn/dropTable, so parsing the whole file has
    // the rollback cancel out the migration — feed_posts.institution_id read as "not expected"
    // for exactly that reason, which is the one mistake a drift report must not make.
    parseMigration(src.split(/export\s+async\s+function\s+down\b/)[0]!, defaultSchema, expected);
  }
  return expected;
}

async function actualFor(schema: string): Promise<Map<string, Set<string>>> {
  const rows = await masterKnex("information_schema.columns")
    .where({ table_schema: schema })
    .select("table_name", "column_name");
  const actual = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = actual.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    actual.set(r.table_name, set);
  }
  return actual;
}

/** Returns the number of tables reported as drifted. */
function compare(label: string, expected: Expected, actual: Map<string, Set<string>>, schema: string, quiet = false): number {
  let drifted = 0;
  const lines: string[] = [];
  let considered = 0;
  for (const [key, cols] of [...expected].sort()) {
    // Only the tables this migration set puts in the schema being examined.
    if (!key.startsWith(`${schema}.`)) continue;
    considered++;
    const table = key.slice(schema.length + 1);
    const live = actual.get(table);
    if (!live) { lines.push(`  ✗ ${table} — TABLE MISSING ENTIRELY`); drifted++; continue; }
    const missing = [...cols].filter((c) => !live.has(c));
    if (missing.length === 0) continue;
    drifted++;
    lines.push(`  ✗ ${table} — MISSING: ${missing.join(", ")}`);
  }
  if (!quiet) {
    console.log(`\n── ${label} — ${considered} tables described by migration files`);
    console.log(lines.length ? lines.join("\n") : "  ✓ every column the files describe is present");
  }
  return drifted;
}

async function main() {
  // The immediate question: what shape is the table that 500s?
  const br = await actualFor("public").then((a) => a.get("business_representations"));
  console.log("── business_representations, as it exists right now");
  if (!br) {
    console.log("  table does not exist");
  } else {
    console.log(`  columns: ${[...br].sort().join(", ")}`);
    const needs = ["originator_id", "originator_type", "target_id", "target_type"];
    const absent = needs.filter((c) => !br.has(c));
    console.log(absent.length ? `  MISSING what the code queries: ${absent.join(", ")}` : "  ✓ has the columns the code queries");
    const [{ count }] = await masterKnex("business_representations").count("* as count");
    console.log(`  rows currently stored: ${count}`);
    if (Number(count) > 0) {
      const sample = await masterKnex("business_representations").limit(3);
      console.log("  sample:", JSON.stringify(sample, null, 2).split("\n").join("\n  "));
    }
  }

  // Recorded vs on disk — catches migrations that never ran at all, a different failure from
  // the in-place edits above.
  for (const [label, table, dir, schema] of [
    ["globalyapp", "knex_migrations_globalyapp", "globalyapp", "public"],
    ["superadmin", "superadmin.knex_migrations", "superadmin", "superadmin"],
  ] as const) {
    const recorded = new Set(await masterKnex(table).pluck("name").catch(() => []));
    const onDisk = readdirSync(join(MIGRATION_ROOT, dir)).filter((f) => f.endsWith(".ts"));
    const never = onDisk.filter((f) => !recorded.has(f));
    // The reverse direction, and the likely reason `never` is non-empty at all: knex aborts
    // migrate:latest with "corrupt migration directory" when a recorded migration's file is
    // gone, and refuses to run ANY pending migration until that is resolved. So an orphaned
    // record blocks every new migration behind it.
    const orphaned = [...recorded].filter((f) => !onDisk.includes(f as string));
    console.log(`\n── ${label}: ${recorded.size} recorded, ${onDisk.length} on disk`);
    console.log(never.length ? `  NEVER RAN: ${never.join(", ")}` : "  ✓ every migration file is recorded as run");
    if (orphaned.length) console.log(`  RECORDED BUT FILE GONE (blocks all pending): ${orphaned.join(", ")}`);
    compare(`${label} columns (schema "${schema}")`, expectedFor(dir, schema), await actualFor(schema), schema);
  }

  // Tenant schemas share two migration sets, so report how many schemas drift rather than
  // printing the same finding once per tenant.
  for (const [kind, dir] of [["business", "business"], ["institution", "institution"]] as const) {
    const table = kind === "business" ? "businesses" : "institutions";
    const q = masterKnex(table).whereNull("deleted_at").whereNotNull("schema_name");
    if (kind === "institution") q.whereNotNull("schema_provisioned_at");
    const schemas: string[] = await q.pluck("schema_name");
    // A schema that was never CREATEd and one created but never migrated both read as "no
    // tables". They need different fixes, so tell them apart rather than lumping them together.
    const live = new Set<string>(await masterKnex("information_schema.schemata").pluck("schema_name"));
    const absent = schemas.filter((s) => !live.has(s));
    const expected = expectedFor(dir, dir);
    const drifted: string[] = [];
    for (const s of schemas) {
      if (!live.has(s)) continue;
      if (compare("", expected, await actualFor(s), dir, true) > 0) drifted.push(s);
    }
    console.log(`\n── ${kind} tenant schemas: ${schemas.length} referenced by rows`);
    console.log(`   ${absent.length} have no schema in the database at all${absent.length ? ` — ${absent.join(", ")}` : ""}`);
    console.log(`   ${drifted.length} exist but are missing tables/columns`);
    if (drifted[0]) compare(`  first drifted one (${drifted[0]})`, expected, await actualFor(drifted[0]), dir);
  }

  await masterKnex.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await masterKnex.destroy();
  process.exit(1);
});
