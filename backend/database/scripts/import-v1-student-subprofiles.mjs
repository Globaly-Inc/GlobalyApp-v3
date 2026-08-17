// Loads the V1 student sub-profiles into V3 (plan M2):
//   student_qualifications   -> platform_user_qualifications
//   student_work_experiences -> platform_user_work_experiences
//   student_language_tests   -> platform_user_language_tests
//
//   node database/scripts/import-v1-student-subprofiles.mjs               # dry run
//   node database/scripts/import-v1-student-subprofiles.mjs --apply       # write
//   node database/scripts/import-v1-student-subprofiles.mjs --self-check  # asserts
//
// Requires import-v1-users.mjs to have run: user_id is resolved uuid ->
// platform_users.id via the preserved platform_users.uuid column.
//
// Idempotent: the V3 tables have uuid primary keys, so the V1 row id is carried
// across as the PK and a re-run updates in place.
//
// student_academic_tests (SAT/GRE/GMAT/ACT/LSAT) has no V3 table. This script
// creates nothing — it counts the rows and reports them for the schema decision
// (the plan proposes a `category` discriminator on platform_user_language_tests,
// owned by agent B2).

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { classifyLooseDate, parseArgs, printList, toDateOrNull, upsertBy, withMigration } from "./migrate-lib.mjs";

// V1 -> V3 is exact column parity for these three tables; only user_id changes
// shape (uuid -> serial). Listing the columns keeps the copy honest: a column
// added on either side shows up as a mismatch rather than being silently skipped.
const TABLES = [
  {
    source: "student_qualifications",
    target: "public.platform_user_qualifications",
    columns: ["qualification_type", "degree_title", "subject_area", "institution_name",
      "grading_system", "grade_value", "is_current", "start_date", "end_date", "sort_order"],
    // start_date/end_date are text on BOTH sides — copied verbatim, but classified
    // so unparseable values are reported rather than quietly stored.
    looseDates: ["start_date", "end_date"],
    hardDates: [],
  },
  {
    source: "student_work_experiences",
    target: "public.platform_user_work_experiences",
    columns: ["job_title", "organization_name", "is_current", "start_date", "end_date", "sort_order"],
    looseDates: ["start_date", "end_date"],
    hardDates: [],
    dropped: ["source_business_member_id (business_members not migrated)"],
  },
  {
    source: "student_language_tests",
    target: "public.platform_user_language_tests",
    columns: ["test_status", "test_type", "overall_score", "test_date", "sub_scores", "sort_order"],
    looseDates: [],
    // test_date is a real `date` column in V3 — anything that will not coerce is
    // reported and stored as NULL rather than aborting the load.
    hardDates: ["test_date"],
  },
];

// ── Load ────────────────────────────────────────────────────────────────────

async function loadTable(v1, v3, spec, userIdByUuid, report) {
  const { rows } = await v1.query(
    `SELECT id::text AS uuid, user_id::text AS user_uuid, ${spec.columns.join(", ")}
       FROM public.${spec.source} ORDER BY user_id, sort_order`,
  );

  for (const row of rows) {
    const userId = userIdByUuid.get(row.user_uuid);
    if (userId === undefined) {
      report.unresolvedUsers.push({ table: spec.source, id: row.uuid, user_uuid: row.user_uuid });
      continue;
    }

    const values = { user_id: userId };
    for (const column of spec.columns) {
      let value = row[column] ?? null;

      if (spec.looseDates.includes(column) && value !== null) {
        const kind = classifyLooseDate(value);
        if (kind === "unparseable" || kind === "mm/yy") {
          report.oddDates.push({ table: spec.source, column, value, kind });
        }
      }
      if (spec.hardDates.includes(column) && value !== null) {
        const coerced = toDateOrNull(value);
        if (coerced === null) report.unparseableDates.push({ table: spec.source, column, value });
        value = coerced;
      }
      if (column === "sub_scores" && value !== null) value = JSON.stringify(value);

      values[column] = value;
    }

    const { inserted } = await upsertBy(v3, spec.target, { id: row.uuid }, { id: row.uuid, ...values });
    report.counts[spec.source] = report.counts[spec.source] ?? { source: 0, inserted: 0, updated: 0 };
    report.counts[spec.source].source++;
    report.counts[spec.source][inserted ? "inserted" : "updated"]++;
  }

  for (const field of spec.dropped ?? []) report.droppedFields.push(`${spec.source}.${field}`);
}

/** No V3 home — count it, describe it, decide later. Writes nothing. */
async function reportAcademicTests(v1, report) {
  const { rows } = await v1.query(
    `SELECT test_type, count(*)::int AS n FROM public.student_academic_tests GROUP BY 1 ORDER BY 2 DESC, 1`,
  );
  report.academicTests = rows;
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(classifyLooseDate("2026-04-12"), "iso-date");
  assert.equal(classifyLooseDate("01/2008"), "mm/yyyy");
  assert.equal(classifyLooseDate("01/24"), "mm/yy");
  assert.equal(classifyLooseDate("2024"), "yyyy");
  assert.equal(classifyLooseDate(""), "empty");
  assert.equal(classifyLooseDate(null), "empty");
  assert.equal(classifyLooseDate("sometime in spring"), "unparseable");

  assert.equal(toDateOrNull("2026-04-12"), "2026-04-12");
  assert.equal(toDateOrNull("01/2008"), "2008-01-01");
  assert.equal(toDateOrNull("2024-05"), "2024-05-01");
  assert.equal(toDateOrNull("2024"), "2024-01-01");
  // "01/24" is ambiguous (Jan 2024? 24 Jan?) — never guess, report it.
  assert.equal(toDateOrNull("01/24"), null);
  assert.equal(toDateOrNull("garbage"), null);
  assert.equal(toDateOrNull(null), null);
  // node-pg returns a `date` column as a Date; the local calendar day is the value.
  assert.equal(classifyLooseDate(new Date(2026, 3, 6)), "iso-date");
  assert.equal(toDateOrNull(new Date(2026, 3, 6)), "2026-04-06");

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) return selfCheck();

  const report = {
    counts: {},
    unresolvedUsers: [],
    unparseableDates: [],
    oddDates: [],
    droppedFields: [],
    academicTests: [],
  };

  await withMigration({ apply: args.apply, label: "V1 -> V3 student sub-profiles" }, async (v1, v3) => {
    const { rows: users } = await v3.query(`SELECT id, uuid FROM public.platform_users WHERE uuid IS NOT NULL`);
    const userIdByUuid = new Map(users.map((u) => [u.uuid, u.id]));
    console.log(`platform_users with a preserved V1 uuid: ${userIdByUuid.size}`);

    for (const spec of TABLES) await loadTable(v1, v3, spec, userIdByUuid, report);
    await reportAcademicTests(v1, report);
  });

  console.log("\ntable                        source  inserted  updated");
  for (const [table, c] of Object.entries(report.counts)) {
    console.log(`  ${table.padEnd(26)} ${String(c.source).padStart(5)} ${String(c.inserted).padStart(9)} ${String(c.updated).padStart(8)}`);
  }

  printList("rows whose user was never migrated (not loaded)", report.unresolvedUsers,
    (r) => `${r.table} ${r.id} user=${r.user_uuid}`);
  printList("UNPARSEABLE dates (stored as NULL)", report.unparseableDates,
    (r) => `${r.table}.${r.column} = "${r.value}"`);
  printList("non-ISO text dates (copied verbatim into a text column)", report.oddDates,
    (r) => `${r.table}.${r.column} = "${r.value}" (${r.kind})`);
  printList("V1 fields with no V3 column (dropped)", report.droppedFields, (f) => f);

  const academicTotal = report.academicTests.reduce((n, r) => n + r.n, 0);
  console.log(`\nstudent_academic_tests: ${academicTotal} rows NOT migrated — no V3 table, none created.`);
  for (const r of report.academicTests) console.log(`   ${r.test_type}: ${r.n}`);
  console.log("   awaiting the schema decision (plan proposes a `category` discriminator on");
  console.log("   platform_user_language_tests, owned by agent B2).");

  if (args.json) console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly — the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
