/**
 * Post-extraction repair: fixes what is provable, and REFUSES everything else.
 * Run: npm run test:data-repair   (DB integration — one throwaway job, cascade-deleted)
 *
 * The refusals are the test's real subject. A repair that merges on a guess is how data gets
 * silently wrong: two dated candidates, contradicting custom_dates, and an admin-edited row must
 * all survive untouched, counted as skipped — while the one unambiguous twin merges with its
 * course links repointed, never orphaned.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";
import { repairDataShape } from "../src/modules/superadmin/data-extraction/lib/data-repair.js";
import { reopenIfReviewing } from "../src/modules/superadmin/data-extraction/lib/site-snapshot.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; }
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function main() {
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://data-repair-test.invalid", source_type: "extraction", status: "processing" })
    .returning("id");
  const j = job.id as string;
  try {
    const [course] = await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: j, name: "BSc Repairs" }).returning("id");

    // ── Intakes ──
    const ins = async (row: Record<string, unknown>) =>
      (await masterKnex(`${S}.extraction_intakes`).insert({ job_id: j, ...row }).returning("id"))[0].id as string;
    await ins({ intake_name: "September 2026", intake_month: null, intake_year: null });               // FILL from own name
    const survivor = await ins({ intake_name: "Orientation week", intake_month: 2, intake_year: 2027, end_date: "2027-06" });
    // Thin in a way the FILL pass cannot cure: deriveIntakeMonthYear reads name + start_date, so a
    // deadline/end_date-only row stays undated and must be MERGED, not filled.
    const thin = await ins({ intake_name: "Orientation week", intake_month: null, intake_year: null,
      end_date: "2027-06-15", admission_deadline: "2027-01-10",
      custom_dates: JSON.stringify({ deposit: "2027-01" }) });                                          // MERGE into survivor
    await masterKnex(`${S}.extraction_course_intake_assignments`).insert({ job_id: j, course_id: course.id, intake_id: thin });
    await ins({ intake_name: "Harvest", intake_month: null, intake_year: null });                       // SKIP: two dated twins
    await ins({ intake_name: "Harvest", intake_month: 1, intake_year: 2026 });
    await ins({ intake_name: "Harvest", intake_month: 1, intake_year: 2027 });
    const adminThin = await ins({ intake_name: "Winter", intake_month: null, intake_year: null, updated_by_platform_user_id: 1 }); // SKIP: admin
    await ins({ intake_name: "Winter", intake_month: 12, intake_year: 2026 });
    await ins({ intake_name: "Harmattan", intake_month: null, intake_year: null, admission_deadline: "2026-09-01" }); // SKIP: dates
    await ins({ intake_name: "Harmattan", intake_month: 10, intake_year: 2026, admission_deadline: "2026-10-01" });  // disagree — two sittings
    const conflictThin = await ins({ intake_name: "Monsoon", intake_month: null, intake_year: null,
      custom_dates: JSON.stringify({ deadline: "2026-01" }) });                                         // SKIP: contradicting milestones
    await ins({ intake_name: "Monsoon", intake_month: 6, intake_year: 2026, custom_dates: JSON.stringify({ deadline: "2026-02" }) });

    // ── Fees ──
    const fee = async (row: Record<string, unknown>) =>
      (await masterKnex(`${S}.extraction_course_fees`).insert({ job_id: j, ...row }).returning("id"))[0].id as string;
    const feeFull = await fee({ name: "Tuition", total_amount: 14000, currency: "GBP", student_type: "international" });
    const feeThin = await fee({ name: "Tuition", total_amount: 14000, currency: null, student_type: "international",
      description: "Per academic year" });                                                              // MERGE + carry description
    await masterKnex(`${S}.extraction_course_fee_assignments`).insert({ job_id: j, course_id: course.id, course_fee_id: feeThin });
    await fee({ name: "App Fee", total_amount: 500, currency: "GBP" });                                 // SKIP: two priced twins
    await fee({ name: "App Fee", total_amount: 500, currency: "USD" });
    await fee({ name: "App Fee", total_amount: 500, currency: null });
    await fee({ name: "Lab Fee", total_amount: 300, currency: "AUD", student_type: "domestic" });        // NOT a candidate for…
    const labThin = await fee({ name: "Lab Fee", total_amount: 300, currency: null, student_type: "international" }); // …a different payer

    // ── English family twins ──
    const eng = async (row: Record<string, unknown>) =>
      (await masterKnex(`${S}.extraction_english_requirements`).insert({ job_id: j, course_id: course.id, ...row }).returning("id"))[0].id as string;
    const engA = await eng({ test_type_name: "IELTS", overall_score: "6.5" });                    // MERGE pair:
    const engB = await eng({ test_type_name: "IELTS Academic", writing_score: "6.0" });           // blanks complement, no contradiction
    await eng({ test_type_name: "TOEFL", overall_score: "88" });                                  // SKIP: scores contradict
    await eng({ test_type_name: "TOEFL iBT", overall_score: "79" });
    await eng({ test_type_name: "Duolingo", overall_score: "110" });                              // SKIP: three of a family
    await eng({ test_type_name: "Duolingo", overall_score: "110" });
    await eng({ test_type_name: "Duolingo", overall_score: "110" });
    const c1 = await eng({ test_type_name: "Cambridge C1 Advanced", overall_score: "180" });      // DIFFERENT tests sharing a first
    const c2 = await eng({ test_type_name: "Cambridge C2 Proficiency", listening_score: "190" }); // word — never merged, never skipped

    // ── Site-list hygiene: binary documents stored ACTIVE ──
    await masterKnex(`${S}.extraction_site_urls`).insert([
      { job_id: j, url: "https://data-repair-test.invalid/poster.pptx", source: "sitemap" },       // EXCLUDE
      { job_id: j, url: "https://data-repair-test.invalid/fees.pdf", source: "sitemap" },          // keep: PDFs have a reader
      { job_id: j, url: "https://data-repair-test.invalid/courses.html", source: "sitemap" },      // keep
    ]);


    // ── Dry run first: same verdicts, zero trace ──
    const dry = await repairDataShape(j, { dryRun: true });
    eq([dry.intake_fields_filled, dry.intake_twins_merged, dry.fee_twins_merged, dry.english_twins_merged, dry.assets_excluded, dry.skipped_ambiguous],
      [1, 1, 1, 1, 1, 7], "a dry run prices the repair with the same candidate logic as the apply");
    eq(!!(await masterKnex(`${S}.extraction_english_requirements`).where({ id: engB }).first()), true, "dry run deletes no English row");
    const pptxDry = await masterKnex(`${S}.extraction_site_urls`).where({ job_id: j }).whereILike("url", "%poster.pptx").first();
    eq(pptxDry?.excluded, false, "dry run excludes nothing");
    eq(!!(await masterKnex(`${S}.extraction_intakes`).where({ id: thin }).first()), true, "dry run deletes nothing");
    const septDry = await masterKnex(`${S}.extraction_intakes`).where({ job_id: j, intake_name: "September 2026" }).first();
    eq([septDry.intake_month, septDry.intake_year], [null, null], "dry run fills nothing");
    eq(!!(await masterKnex(`${S}.extraction_job_events`).where({ job_id: j, kind: "data_repaired" }).first()), false,
      "dry run writes no timeline event — invented history is worse than none");

    // ── Repair ──
    const r = await repairDataShape(j);
    eq(r.intake_fields_filled, 1, "September 2026 gains its month and year from its own name");
    eq(r.intake_twins_merged, 1, "exactly the one unambiguous intake twin merges");
    eq(r.fee_twins_merged, 1, "exactly the one unambiguous fee twin merges");
    eq(r.english_twins_merged, 1, "the complementary IELTS spellings merge into one row");
    eq(r.assets_excluded, 1, "the leaked .pptx is excluded from the crawl list");
    eq(r.skipped_ambiguous, 7, "ambiguous intake + admin + milestones + DATE-CONFLICT intake + ambiguous fee + contradicting TOEFL + triple Duolingo all REFUSED");

    const sept = await masterKnex(`${S}.extraction_intakes`).where({ job_id: j, intake_name: "September 2026" }).first();
    eq([sept.intake_month, sept.intake_year], [9, 2026], "filled values are the name's own");
    eq(await masterKnex(`${S}.extraction_intakes`).where({ id: thin }).first(), undefined, "the merged thin intake is gone");
    const repointed = await masterKnex(`${S}.extraction_course_intake_assignments`).where({ course_id: course.id, intake_id: survivor }).first();
    eq(!!repointed, true, "the thin twin's course link now points at the survivor");
    const carried = await masterKnex(`${S}.extraction_intakes`).where({ id: survivor }).first();
    eq(carried.custom_dates, { deposit: "2027-01" }, "the thin twin's milestones ride across when the survivor had none");
    eq(carried.admission_deadline, "2027-01-10", "the thin twin's DEADLINE is carried, never deleted with it");
    eq(carried.end_date, "2027-06-15", "agreeing dates keep the SHARPER value");
    eq(Number((await masterKnex(`${S}.extraction_intakes`).where({ job_id: j, intake_name: "Harmattan" }).count("* as n").first())!.n), 2,
      "conflicting dates under one name are two sittings — both survive");
    eq(Number((await masterKnex(`${S}.extraction_intakes`).where({ job_id: j, intake_name: "Harvest" }).count("* as n").first())!.n), 3,
      "two dated candidates → all three Harvest rows survive");
    eq(!!(await masterKnex(`${S}.extraction_intakes`).where({ id: adminThin }).first()), true, "an admin-edited thin row is never touched");
    const conflictRow = await masterKnex(`${S}.extraction_intakes`).where({ id: conflictThin }).first();
    eq(conflictRow?.custom_dates, { deadline: "2026-01" }, "contradicting milestones are kept apart, both intact");
    eq(await masterKnex(`${S}.extraction_course_fees`).where({ id: feeThin }).first(), undefined, "the merged thin fee is gone");
    eq(!!(await masterKnex(`${S}.extraction_course_fee_assignments`).where({ course_id: course.id, course_fee_id: feeFull }).first()), true,
      "the fee link now points at the priced twin");
    eq((await masterKnex(`${S}.extraction_course_fees`).where({ id: feeFull }).first())?.description, "Per academic year",
      "the thin fee's details ride across to the survivor");
    eq(!!(await masterKnex(`${S}.extraction_course_fees`).where({ id: labThin }).first()), true,
      "a same-priced fee for a DIFFERENT payer is not a candidate — the international Lab Fee survives");
    eq(!!(await masterKnex(`${S}.extraction_english_requirements`).where({ id: c1 }).first())
      && !!(await masterKnex(`${S}.extraction_english_requirements`).where({ id: c2 }).first()), true,
      "Cambridge C1 and C2 are different tests — sameTest keeps them apart where a first-word grouping merged them");
    eq(Number((await masterKnex(`${S}.extraction_course_fees`).where({ job_id: j, name: "App Fee" }).count("* as n").first())!.n), 3,
      "two priced candidates → all App Fee rows survive");
    const mergedEng = await masterKnex(`${S}.extraction_english_requirements`).where({ id: engA }).first();
    eq([mergedEng?.overall_score, mergedEng?.writing_score], ["6.5", "6.0"], "the survivor gains the donor's blanks, loses nothing");
    eq(await masterKnex(`${S}.extraction_english_requirements`).where({ id: engB }).first(), undefined, "the donor spelling is gone");
    eq(Number((await masterKnex(`${S}.extraction_english_requirements`).where({ job_id: j }).whereILike("test_type_name", "TOEFL%").count("* as n").first())!.n), 2,
      "contradicting TOEFL scores stay as two rows for a human");
    const pptx = await masterKnex(`${S}.extraction_site_urls`).where({ job_id: j }).whereILike("url", "%poster.pptx").first();
    const pdf = await masterKnex(`${S}.extraction_site_urls`).where({ job_id: j }).whereILike("url", "%fees.pdf").first();
    eq([pptx?.excluded, pdf?.excluded], [true, false], "binary docs are excluded; PDFs keep their own reader");
    const ev = await masterKnex(`${S}.extraction_job_events`).where({ job_id: j, kind: "data_repaired" }).first();
    eq(!!ev, true, "the repair is visible on the timeline, never silent");

    // ── A snapshot wave finishing after review must reopen the job — and ONLY review ──
    const [rev] = await masterKnex(`${S}.extraction_jobs`)
      .insert({ institution_url: "https://data-repair-reopen.invalid", source_type: "extraction", status: "review" }).returning("id");
    const [paused] = await masterKnex(`${S}.extraction_jobs`)
      .insert({ institution_url: "https://data-repair-paused.invalid", source_type: "extraction", status: "paused" }).returning("id");
    try {
      eq(await reopenIfReviewing(rev.id), true, "a review job reopens for the archive wave's new pages");
      eq((await masterKnex(`${S}.extraction_jobs`).where({ id: rev.id }).first())?.status, "processing",
        "…to processing, where checkAllPagesDone can advance it");
      eq(await reopenIfReviewing(paused.id), false, "a PAUSED job is never resurrected");
      eq((await masterKnex(`${S}.extraction_jobs`).where({ id: paused.id }).first())?.status, "paused", "pause stays a pause");
    } finally {
      await masterKnex(`${S}.extraction_jobs`).whereIn("id", [rev.id, paused.id]).delete();
    }

    // Idempotent: a second pass finds nothing new to merge or fill.
    const r2 = await repairDataShape(j);
    eq([r2.intake_fields_filled, r2.intake_twins_merged, r2.fee_twins_merged, r2.english_twins_merged, r2.assets_excluded], [0, 0, 0, 0, 0],
      "a second pass repairs nothing — only the standing refusals remain");
    eq(Number((await masterKnex(`${S}.extraction_job_events`).where({ job_id: j, kind: "data_repaired" }).count("* as n").first())!.n), 1,
      "and it writes NO second event — standing refusals are the shape report's job, not re-announced per run");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: j }).delete();
    await masterKnex.destroy();
  }
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
