// Re-resolves the staged extraction reference FKs that the extraction import
// dropped: superadmin.extraction_course_fees.fee_type_id and
// superadmin.extraction_eligibility_requirements.degree_level_id.
//
//   node database/scripts/backfill-extraction-reference-ids.mjs               # dry run (default)
//   node database/scripts/backfill-extraction-reference-ids.mjs --apply       # write
//   node database/scripts/backfill-extraction-reference-ids.mjs --self-check  # pure-fn asserts
//
// V1 had one canonical vocabulary (public.fee_types, public.degree_levels, both
// uuid) and real FKs from the staged extraction rows into it. V3 ported that
// vocabulary to public.fee_types / public.degree_levels with serial ids, so the
// uuids cannot carry across — the importer left every fee_type_id and all but
// four degree_level_id NULL. Migration 20260816_001_extraction_reference_fks
// retypes both columns to integer; this script re-reads the V1 values, resolves
// them by name against the V3 vocabulary and writes the integer ids.
//
// Only rows V1 itself had resolved are written. The rest are staging free text
// (extraction_course_fees.name, extraction_eligibility_requirements
// .min_degree_level) that a reviewer resolves in the extraction UI — guessing a
// fee type from "Fee Group 2" here would invent data V1 never had.
//
// Idempotent: the same V1 value resolves to the same id, so a second run reports
// zero changes. Runs in one transaction (rolled back unless --apply).

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { planFix } from "./backfill-country-fks.mjs";
import { parseArgs, printList, withMigration } from "./migrate-lib.mjs";

// Overridable so the integration test can point V1 at a fixture schema, the same
// way import-v1-extraction.mjs does.
const V1_SCHEMA = process.env.V1_SCHEMA || "public";

const TARGETS = [
  {
    column: "fee_type_id",
    v1Table: "extraction_course_fees",
    v1Vocab: "fee_types",
    v3Table: "superadmin.extraction_course_fees",
    v3Vocab: "public.fee_types",
  },
  {
    column: "degree_level_id",
    v1Table: "extraction_eligibility_requirements",
    v1Vocab: "degree_levels",
    v3Table: "superadmin.extraction_eligibility_requirements",
    v3Vocab: "public.degree_levels",
  },
];

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/**
 * Case- and whitespace-insensitive name -> id lookup over a vocabulary table.
 * First row wins, so a duplicate name never flips between runs.
 */
export function buildNameResolver(rows) {
  const byName = new Map();
  for (const row of rows) {
    const key = String(row.name ?? "").trim().toLowerCase();
    if (key !== "" && !byName.has(key)) byName.set(key, row.id);
  }
  return (name) => {
    const key = String(name ?? "").trim().toLowerCase();
    return key === "" ? null : byName.get(key) ?? null;
  };
}

/** Group planned writes by target id so N rows cost one UPDATE per distinct id. */
export function groupByTargetId(fixes) {
  const byId = new Map();
  for (const { id, to } of fixes) {
    if (!byId.has(to)) byId.set(to, []);
    byId.get(to).push(id);
  }
  return byId;
}

/**
 * Unresolved rows repeat the same handful of vocabulary names, so the report
 * counts each distinct name once instead of printing a line per row.
 */
export function tallyUnresolved(list, entry) {
  const key = `${entry.table}.${entry.column}=${entry.value}`;
  const seen = list.find((x) => x.key === key);
  if (seen) seen.count += 1;
  else list.push({ ...entry, key, count: 1 });
  return list;
}

// ── Counts ──────────────────────────────────────────────────────────────────

async function nullCounts(v3) {
  const parts = TARGETS.map(
    (t) => `(SELECT count(*)::int FROM ${t.v3Table} WHERE ${t.column} IS NULL) AS "${t.v1Table}.${t.column}"`,
  );
  const { rows } = await v3.query(`SELECT ${parts.join(", ")}`);
  return rows[0];
}

/**
 * The retype migration has to be in place first — writing an integer id into a
 * uuid column fails with a type error that says nothing useful.
 */
async function assertRetyped(v3, target) {
  const [schema, table] = target.v3Table.split(".");
  const { rows } = await v3.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, target.column],
  );
  if (rows.length === 0) throw new Error(`${target.v3Table}.${target.column} does not exist`);
  if (rows[0].data_type !== "integer") {
    throw new Error(
      `${target.v3Table}.${target.column} is ${rows[0].data_type}, expected integer — ` +
        `run "npm run migrate:superadmin" (20260816_001_extraction_reference_fks) first`,
    );
  }
}

// ── Backfill ────────────────────────────────────────────────────────────────

async function backfillTarget(v1, v3, target, report) {
  await assertRetyped(v3, target);

  const { rows: vocab } = await v3.query(
    `SELECT id, name FROM ${target.v3Vocab} WHERE deleted_at IS NULL ORDER BY id`,
  );
  const resolve = buildNameResolver(vocab);

  // V1 rows that actually carried a reference, with the name they pointed at.
  const { rows: source } = await v1.query(
    `SELECT t.id::text AS id, v.name
       FROM ${V1_SCHEMA}.${target.v1Table} t
       JOIN ${V1_SCHEMA}.${target.v1Vocab} v ON v.id = t.${target.column}
      WHERE t.${target.column} IS NOT NULL`,
  );
  if (source.length === 0) return;

  const { rows: current } = await v3.query(
    `SELECT id::text AS id, ${target.column} AS ref FROM ${target.v3Table} WHERE id = ANY($1::uuid[])`,
    [source.map((r) => r.id)],
  );
  const byId = new Map(current.map((r) => [r.id, r.ref]));

  const writes = [];
  for (const row of source) {
    if (!byId.has(row.id)) {
      report.missingInV3.push({ table: target.v1Table, id: row.id, name: row.name });
      continue;
    }
    const fix = planFix(byId.get(row.id) ?? null, resolve(row.name), row.name);
    if (fix.action === "unresolved") {
      tallyUnresolved(report.unresolved, { table: target.v1Table, column: target.column, value: row.name });
      continue;
    }
    if (fix.action === "unchanged") continue;
    writes.push({ id: row.id, to: fix.to });
    report[fix.action].push({ table: target.v1Table, column: target.column, value: row.name, id: fix.to });
  }

  for (const [refId, ids] of groupByTargetId(writes)) {
    await v3.query(
      `UPDATE ${target.v3Table} SET ${target.column} = $1, updated_at = now() WHERE id = ANY($2::uuid[])`,
      [refId, ids],
    );
  }
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  const resolve = buildNameResolver([
    { id: 22, name: "Tuition Fee" },
    { id: 18, name: "High School" },
    { id: 99, name: "Tuition Fee" }, // duplicate name — first row wins
  ]);
  assert.equal(resolve("Tuition Fee"), 22);
  assert.equal(resolve("  tuition fee  "), 22, "trimmed + lowercased");
  assert.equal(resolve("HIGH SCHOOL"), 18);
  assert.equal(resolve("Nonexistent Fee"), null);
  assert.equal(resolve(""), null);
  assert.equal(resolve(null), null);
  assert.equal(resolve(undefined), null);

  // planFix drives idempotency: repair once, unchanged forever after.
  assert.equal(planFix(null, 22, "Tuition Fee").action, "repaired");
  assert.equal(planFix(22, 22, "Tuition Fee").action, "unchanged");
  assert.equal(planFix(21, 22, "Tuition Fee").action, "corrected");
  assert.equal(planFix(null, null, "Ghost Fee").action, "unresolved");

  const grouped = groupByTargetId([
    { id: "a", to: 22 },
    { id: "b", to: 22 },
    { id: "c", to: 18 },
  ]);
  assert.equal(grouped.size, 2);
  assert.deepEqual(grouped.get(22), ["a", "b"]);
  assert.deepEqual(grouped.get(18), ["c"]);
  assert.equal(groupByTargetId([]).size, 0);

  const unresolved = [];
  tallyUnresolved(unresolved, { table: "extraction_course_fees", column: "fee_type_id", value: "Ghost Fee" });
  tallyUnresolved(unresolved, { table: "extraction_course_fees", column: "fee_type_id", value: "Ghost Fee" });
  tallyUnresolved(unresolved, { table: "extraction_course_fees", column: "fee_type_id", value: "Other Fee" });
  assert.equal(unresolved.length, 2, "same name tallied once");
  assert.equal(unresolved[0].count, 2);
  assert.equal(unresolved[1].count, 1);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) return selfCheck();

  const report = { repaired: [], corrected: [], unresolved: [], missingInV3: [] };

  await withMigration({ apply: args.apply, label: "extraction reference FK backfill" }, async (v1, v3) => {
    report.before = await nullCounts(v3);
    for (const target of TARGETS) await backfillTarget(v1, v3, target, report);
    report.after = await nullCounts(v3);
  });

  if (report.before && report.after) {
    console.log("\nNULL counts (before -> after):");
    for (const key of Object.keys(report.before)) {
      console.log(`  ${key.padEnd(50)} ${report.before[key]} -> ${report.after[key]}`);
    }
  }
  console.log(`\nrepaired (NULL -> id):  ${report.repaired.length}`);
  console.log(`corrected (wrong id):   ${report.corrected.length}`);

  printList(
    "STILL UNRESOLVED (left NULL)",
    report.unresolved,
    (r) => `${r.table}.${r.column} = "${r.value}" (${r.count} row${r.count === 1 ? "" : "s"})`,
  );
  printList("V1 rows with no V3 counterpart", report.missingInV3, (r) => `${r.table} ${r.id} ("${r.name}")`);

  if (args.json) console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly — the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
