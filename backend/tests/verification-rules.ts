/**
 * Every data-shape rule proves itself on fixtures before its counts are believed.
 * Run: npm run test:verification-rules   (DB integration — seeds one throwaway job, cascades away)
 *
 * The rule here is the lesson this suite exists to encode: a broken check is indistinguishable
 * from broken data in a count. On the day these rules were written, three hand-run audit queries
 * reported false defect rates (one claimed 100% of fees had no amount — a knex `?` binding ate
 * the regex). So every rule is asserted against a seed containing exactly known-bad and known-good
 * rows, and must count PRECISELY the bad ones: a rule counting zero is dead, a rule counting
 * everything is broken, and both fail this suite rather than shipping.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";
import { SHAPE_RULES, countRule, verifyDataShape } from "../src/modules/superadmin/data-extraction/lib/verification-rules.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function main() {
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://verification-rules-test.invalid", source_type: "extraction", status: "processing" })
    .returning("id");
  const j = job.id as string;

  try {
    // ── Seed: per table, known-good beside known-bad ──
    await masterKnex(`${S}.extraction_intakes`).insert([
      { job_id: j, intake_name: "September 2026", intake_month: 9, intake_year: 2026 },          // good
      { job_id: j, intake_name: "Fall", intake_month: null, intake_year: null },                 // no year, no month
      { job_id: j, intake_name: "Spring intake", intake_month: 2, intake_year: 2027 },           // good…
      { job_id: j, intake_name: "Spring intake", intake_month: null, intake_year: null },        // …and its undated twin → fork
    ]);
    await masterKnex(`${S}.extraction_course_fees`).insert([
      { job_id: j, name: "Tuition", total_amount: 14000, currency: "GBP" },                      // good
      { job_id: j, name: "Tuition", total_amount: 14000, currency: null },                       // amount, no currency → also forks
      { job_id: j, name: "Application Fee", total_amount: null, currency: "GBP" },               // no amount
      { job_id: j, name: "Deposit", total_amount: 0, currency: "GBP" },                          // zero amount
    ]);
    const [course] = await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: j, name: "BSc Fixtures", degree_level_code: "bachelor", subject_area_code: "business", source_url: "https://verification-rules-test.invalid/bsc" })
      .returning("id");
    await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: j, name: "Mystery Programme", degree_level_code: null, subject_area_code: null, source_url: null });
    await masterKnex(`${S}.extraction_english_requirements`).insert([
      { job_id: j, course_id: course.id, test_type_name: "IELTS", overall_score: "6.5" },        // good…
      { job_id: j, course_id: course.id, test_type_name: "IELTS Academic", overall_score: "7.0" }, // …same family twice → dup
      { job_id: j, course_id: course.id, test_type_name: "", overall_score: "88" },              // no test name
      { job_id: j, course_id: course.id, test_type_name: "PTE" },                                // no scores at all
    ]);
    await masterKnex(`${S}.extraction_eligibility_requirements`).insert([
      { job_id: j, name: "Academic requirement", description: "Completion of year 12 or equivalent" }, // good
      { job_id: j, name: "Target Audience Requirements", description: null },                          // name-only
    ]);
    await masterKnex(`${S}.extraction_study_options`).insert([
      { job_id: j, name: "Full-time", study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" }, // good
      { job_id: j, name: "Part-time", study_mode: "on_campus", study_load: "part_time", duration_value: null },                      // no duration
    ]);

    // ── What each rule MUST count against that seed — exactly the bad rows, never the good ──
    const expected: Record<string, number> = {
      intake_no_year: 2,
      intake_no_month: 2,
      fee_no_amount: 2,
      fee_amount_no_currency: 1,
      english_no_test_name: 1,
      english_no_scores: 1,
      eligibility_name_only: 1,
      course_unlinked_level: 1,
      course_unlinked_area: 1,
      course_no_source_url: 1,
      study_option_no_duration: 1,
      intake_forked_year: 1,
      fee_forked_currency: 1,
      english_same_test_twice: 1,
    };
    eq(SHAPE_RULES.length, Object.keys(expected).length, "every rule has a fixture expectation (add one when adding a rule)");
    for (const rule of SHAPE_RULES) {
      const n = await countRule(rule, j);
      eq(n, expected[rule.id] ?? -1, `rule ${rule.id} counts exactly its bad rows`);
      if ((expected[rule.id] ?? 0) === 0) { failed++; console.error(`FAIL rule ${rule.id} has no bad fixture — a dead rule proves nothing`); }
    }

    // ── The report adds up, scopes to the job, and lands on the timeline ──
    const report = await verifyDataShape(j);
    eq(report.blocking, 2 + 2 + 1 + 1, "blocking total = yearless intakes + bad fee amounts + currencyless fee + nameless English");
    eq(report.advisory, 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1, "advisory total adds up");
    const ev = await masterKnex(`${S}.extraction_job_events`)
      .where({ job_id: j, kind: "data_shape_verified" }).orderBy("created_at", "desc").first();
    eq(ev?.level, "warn", "blocking issues make the timeline event a warning");

    // A pristine job reports zero everything — the rules must not leak across jobs.
    const [clean] = await masterKnex(`${S}.extraction_jobs`)
      .insert({ institution_url: "https://verification-rules-clean.invalid", source_type: "extraction", status: "processing" })
      .returning("id");
    try {
      const zero = await verifyDataShape(clean.id);
      eq([zero.blocking, zero.advisory], [0, 0], "a job with no rows has no issues (rules are job-scoped)");
    } finally {
      await masterKnex(`${S}.extraction_jobs`).where({ id: clean.id }).delete();
    }
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: j }).delete();
    await masterKnex.destroy();
  }
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
