/**
 * upsertStudyOption — study options should be SHARED across every course that offers them, the
 * same pattern upsertFee/upsertIntake/upsertEligibility/upsertStudyUnit already use. Before this
 * fix, NO upsert helper existed for extraction_study_options at all: every course write inserted
 * a fresh row unconditionally, so two courses both offering "on_campus, full_time, 3 years" got
 * two separate rows instead of sharing one — the Study Options tab looked like one option per
 * course rather than options genuinely shared across the courses that offer them.
 *
 * Style matches tests/course-degree-qualifier-matching.ts: DB integration against the real dev
 * DB, self-cleaning.
 *
 * Run: node --import tsx tests/study-option-dedup.ts
 */
import "dotenv/config";

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function main() {
  const { upsertStudyOption, writeCourse } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://study-option-dedup-test.invalid", source_type: "extraction", status: "processing" })
    .returning("id");

  try {
    // ── Direct upsertStudyOption calls ──
    const id1 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    const id2 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    assert(id1 === id2, "an identical (mode, load, duration) tuple reuses the SAME row");

    const id3 = await upsertStudyOption(job.id, { study_mode: "online", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    assert(id3 !== id1, "a different study_mode creates a DIFFERENT row");

    const id4 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "part_time", duration_value: 3, duration_unit: "years" });
    assert(id4 !== id1, "a different study_load creates a DIFFERENT row");

    const id5 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 6, duration_unit: "years" });
    assert(id5 !== id1, "a different duration_value creates a DIFFERENT row");

    // name is filled if missing, never overwritten.
    const id6 = await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years" });
    const id7 = await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years", name: "Standard" });
    assert(id6 === id7, "same tuple still shares a row once a name is added");
    const row7 = await masterKnex(`${S}.extraction_study_options`).where({ id: id7 }).first();
    assert(row7.name === "Standard", "the blank name got filled");
    await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years", name: "Different Name" });
    const row7Again = await masterKnex(`${S}.extraction_study_options`).where({ id: id7 }).first();
    assert(row7Again.name === "Standard", "a stated name is never overwritten by a later call");

    const totalOptions = await masterKnex(`${S}.extraction_study_options`).where({ job_id: job.id });
    assert(totalOptions.length === 5, "exactly 5 distinct option rows for 5 distinct tuples (not 7 inserts)");

    // ── End-to-end via writeCourse: two DIFFERENT courses sharing one option ──
    const courseA = { name: "Bachelor of Testing A", study_options: [{ study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" }] };
    const courseB = { name: "Bachelor of Testing B", study_options: [{ study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" }] };
    const idA = await writeCourse(job.id, courseA as never, new Map());
    const idB = await writeCourse(job.id, courseB as never, new Map());

    const assignA = await masterKnex(`${S}.extraction_course_study_option_assignments`).where({ course_id: idA }).first();
    const assignB = await masterKnex(`${S}.extraction_course_study_option_assignments`).where({ course_id: idB }).first();
    assert(assignA.study_option_id === assignB.study_option_id, "two different courses offering the identical option share ONE study_option row");
    assert(assignA.study_option_id === id1, "and it's the SAME row upsertStudyOption already created above (job-scoped sharing, not just within one writeCourse call)");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
