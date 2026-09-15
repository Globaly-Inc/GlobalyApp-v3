/**
 * upsertStudyOption — study options should be SHARED across every course that offers them, same
 * pattern as upsertFee/upsertIntake/upsertEligibility/upsertStudyUnit. Also covers the admin's
 * manual "Add study option" form (staged.service.ts's createStudyOption): once options are
 * deduped at the DB level, that path's raw insert would otherwise throw a constraint violation
 * the moment it matched an existing tuple, and its junction insert would throw a second one on a
 * double-submit — both fixed (2026-09-15) to reuse/relink instead of erroring, and to log an
 * accurate audit event (create vs. link vs. no-op) instead of always claiming a creation.
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
  const { createStudyOption } = await import("../src/modules/superadmin/data-extraction/services/staged.service.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://study-option-dedup-test.invalid", source_type: "extraction", status: "processing" })
    .returning("id");

  try {
    // ── Direct upsertStudyOption calls ──
    const r1 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    const r2 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    const id1 = r1.id;
    assert(id1 === r2.id, "an identical (mode, load, duration) tuple reuses the SAME row");
    assert(r1.created === true, "the first call reports it created a new row");
    assert(r2.created === false, "the second, matching call reports it did NOT create a new row");

    const r3 = await upsertStudyOption(job.id, { study_mode: "online", study_load: "full_time", duration_value: 3, duration_unit: "years" });
    assert(r3.id !== id1, "a different study_mode creates a DIFFERENT row");
    assert(r3.created === true, "…and reports a genuine creation");

    const r4 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "part_time", duration_value: 3, duration_unit: "years" });
    assert(r4.id !== id1, "a different study_load creates a DIFFERENT row");

    const r5 = await upsertStudyOption(job.id, { study_mode: "on_campus", study_load: "full_time", duration_value: 6, duration_unit: "years" });
    assert(r5.id !== id1, "a different duration_value creates a DIFFERENT row");

    // name is filled if missing, never overwritten.
    const r6 = await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years" });
    const r7 = await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years", name: "Standard" });
    assert(r6.id === r7.id, "same tuple still shares a row once a name is added");
    const row7 = await masterKnex(`${S}.extraction_study_options`).where({ id: r7.id }).first();
    assert(row7.name === "Standard", "the blank name got filled");
    await upsertStudyOption(job.id, { study_mode: "hybrid", study_load: "full_time", duration_value: 2, duration_unit: "years", name: "Different Name" });
    const row7Again = await masterKnex(`${S}.extraction_study_options`).where({ id: r7.id }).first();
    assert(row7Again.name === "Standard", "a stated name is never overwritten by a later call");

    const totalOptions = await masterKnex(`${S}.extraction_study_options`).where({ job_id: job.id });
    assert(totalOptions.length === 5, "exactly 5 distinct option rows for 5 distinct tuples (not 7 inserts)");

    // Two page workers racing on the identical tuple: both must resolve to the SAME row, not
    // each insert their own — this is what the DB-level unique index (migration 20260911_001)
    // plus the atomic ON CONFLICT DO UPDATE guards against check-then-insert can't.
    const concurrentTuple = { study_mode: "on_campus", study_load: "full_time", duration_value: 4, duration_unit: "years" };
    const [race1, race2, race3] = await Promise.all([
      upsertStudyOption(job.id, concurrentTuple),
      upsertStudyOption(job.id, concurrentTuple),
      upsertStudyOption(job.id, concurrentTuple),
    ]);
    assert(race1.id === race2.id && race2.id === race3.id, "three concurrent calls on the identical tuple all resolve to the same row");
    assert([race1.created, race2.created, race3.created].filter(Boolean).length === 1, "exactly ONE of the three concurrent calls reports the creation, not all three");
    const raceRows = await masterKnex(`${S}.extraction_study_options`)
      .where({ job_id: job.id, study_mode: "on_campus", study_load: "full_time", duration_value: 4, duration_unit: "years" });
    assert(raceRows.length === 1, "only one row exists for the raced tuple, not three");

    // ── End-to-end via writeCourse: two DIFFERENT courses sharing one option ──
    const courseA = { name: "Bachelor of Testing A", study_options: [{ study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" }] };
    const courseB = { name: "Bachelor of Testing B", study_options: [{ study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" }] };
    const idA = await writeCourse(job.id, courseA as never, new Map());
    const idB = await writeCourse(job.id, courseB as never, new Map());

    const assignA = await masterKnex(`${S}.extraction_course_study_option_assignments`).where({ course_id: idA }).first();
    const assignB = await masterKnex(`${S}.extraction_course_study_option_assignments`).where({ course_id: idB }).first();
    assert(assignA.study_option_id === assignB.study_option_id, "two different courses offering the identical option share ONE study_option row");
    assert(assignA.study_option_id === id1, "and it's the SAME row upsertStudyOption already created above (job-scoped sharing, not just within one writeCourse call)");

    // ── The admin's manual "Add study option" form (createStudyOption) — including audit accuracy ──
    const [courseC] = await masterKnex(`${S}.extraction_courses`).insert({ job_id: job.id, name: "Bachelor of Testing C" }).returning("id");
    const [courseD] = await masterKnex(`${S}.extraction_courses`).insert({ job_id: job.id, name: "Bachelor of Testing D" }).returning("id");
    const manualOpt = { job_id: job.id, study_mode: "on_campus", study_load: "full_time", duration_value: 3, duration_unit: "years" };
    const countBeforeManual = (await masterKnex(`${S}.extraction_study_options`).where({ job_id: job.id })).length;
    const auditCount = async () => {
      const row = await masterKnex(`${S}.admin_audit_logs`).where({ entity_type: "extraction_study_options" }).count("id as n").first();
      return Number(row?.n ?? 0);
    };

    const auditBeforeC = await auditCount();
    const manualC = await createStudyOption({ ...manualOpt, course_id: courseC.id }, 1);
    assert(manualC.id === id1, "manually adding an option matching an existing tuple REUSES it, not a duplicate row");
    assert(await auditCount() === auditBeforeC + 1, "reusing an existing option but linking a NEW course logs exactly one audit event (STUDY_OPTION_LINK, not a fabricated CREATE)");

    const auditBeforeD = await auditCount();
    const manualD = await createStudyOption({ ...manualOpt, course_id: courseD.id }, 1);
    assert(manualD.id === id1, "…for a second, different course too");
    assert(await auditCount() === auditBeforeD + 1, "…and logs its own link event too");

    let doubleSubmitThrew = false;
    const auditBeforeDouble = await auditCount();
    try {
      await createStudyOption({ ...manualOpt, course_id: courseC.id }, 1);
    } catch {
      doubleSubmitThrew = true;
    }
    assert(!doubleSubmitThrew, "re-submitting the SAME option for the SAME course is a harmless no-op, not a constraint-violation error");
    assert(await auditCount() === auditBeforeDouble, "…and a true no-op (nothing created, nothing newly linked) logs NO audit event at all");

    const countAfterManual = (await masterKnex(`${S}.extraction_study_options`).where({ job_id: job.id })).length;
    assert(countAfterManual === countBeforeManual, "manual creates that matched an existing tuple added no new rows");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
