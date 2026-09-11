/**
 * writeCourse's AgentCIS guardrail: a website-enrichment pass over an AgentCIS job must only fill
 * a fee/intake/study-option/eligibility/english-requirement category a course has NONE of yet,
 * never add a second row beside one AgentCIS already gave it. Non-AgentCIS jobs stay unaffected.
 *
 * Run: node --import tsx tests/agentcis-writecourse-guardrail.ts
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
  const { writeCourse } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  const [agentcisJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://agentcis-guardrail-test.invalid", source_type: "agentcis", status: "processing" })
    .returning("id");
  const [otherJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://agentcis-guardrail-test-other.invalid", source_type: "extraction", status: "processing" })
    .returning("id");

  try {
    const [agentcisCourse] = await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: agentcisJob.id, name: "Bachelor of Testing" }).returning("id");
    const [otherCourse] = await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: otherJob.id, name: "Bachelor of Testing" }).returning("id");

    // AgentCIS course already has one fee, one intake, one eligibility row (its own authoritative
    // data) — no study units yet, since AgentCIS never provides those.
    const [existingFee] = await masterKnex(`${S}.extraction_course_fees`)
      .insert({ job_id: agentcisJob.id, name: "AgentCIS Tuition Fee", total_amount: 50000 }).returning("id");
    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: agentcisJob.id, course_id: agentcisCourse.id, course_fee_id: existingFee.id });

    const [existingIntake] = await masterKnex(`${S}.extraction_intakes`)
      .insert({ job_id: agentcisJob.id, intake_name: "AgentCIS February", intake_month: 2, intake_year: 2027 }).returning("id");
    await masterKnex(`${S}.extraction_course_intake_assignments`)
      .insert({ job_id: agentcisJob.id, course_id: agentcisCourse.id, intake_id: existingIntake.id });

    const [existingElig] = await masterKnex(`${S}.extraction_eligibility_requirements`)
      .insert({ job_id: agentcisJob.id, name: "AgentCIS Entry Requirements", min_degree_level: "Bachelor" }).returning("id");
    await masterKnex(`${S}.extraction_course_eligibility_assignments`)
      .insert({ job_id: agentcisJob.id, course_id: agentcisCourse.id, eligibility_requirement_id: existingElig.id });

    // What a website-enrichment pass would find on this same course.
    const scrapedCourse = {
      name: "Bachelor of Testing",
      fees: [{ name: "Scraped Tuition Fee", total_amount: 99999, student_type: "both", period_type: "Per Year" }],
      intakes: [{ intake_name: "Scraped September", intake_month: 9, intake_year: 2027 }],
      eligibility: [{ name: "Scraped Entry Requirements", min_degree_level: "Master" }],
      study_units: [{ unit_name: "Intro to Testing", credit_points: 6 }],
    };

    await writeCourse(agentcisJob.id, scrapedCourse as never, new Map());

    const feeAssignments = await masterKnex(`${S}.extraction_course_fee_assignments`).where({ course_id: agentcisCourse.id });
    assert(feeAssignments.length === 1, "AgentCIS course: fee count stays at 1 (scraped fee not added)");
    assert(feeAssignments[0]?.course_fee_id === existingFee.id, "AgentCIS course: the one fee is still the original AgentCIS row");

    const intakeAssignments = await masterKnex(`${S}.extraction_course_intake_assignments`).where({ course_id: agentcisCourse.id });
    assert(intakeAssignments.length === 1, "AgentCIS course: intake count stays at 1 (scraped intake not added)");

    const eligAssignments = await masterKnex(`${S}.extraction_course_eligibility_assignments`).where({ course_id: agentcisCourse.id });
    assert(eligAssignments.length === 1, "AgentCIS course: eligibility count stays at 1 (scraped requirement not added)");

    const unitAssignments = await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: agentcisCourse.id });
    assert(unitAssignments.length === 1, "AgentCIS course: study unit WAS added (this category had none before)");

    // A second page for the SAME course naming a DIFFERENT unit must still land — study units
    // are not behind the "has existing -> skip" guard, since AgentCIS never has any to protect
    // and page order shouldn't decide which units a course ends up with.
    await writeCourse(agentcisJob.id, {
      name: "Bachelor of Testing",
      study_units: [{ unit_name: "Advanced Testing", credit_points: 6 }],
    } as never, new Map());
    const unitAssignmentsAfter = await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: agentcisCourse.id });
    assert(unitAssignmentsAfter.length === 2, "AgentCIS course: a later page's different study unit is ALSO added, not blocked by the first");

    // Same scraped data, but a non-AgentCIS job — normal writeCourse behaviour must be untouched:
    // the fee is written straight away since this isn't a source_type "agentcis" job.
    await writeCourse(otherJob.id, scrapedCourse as never, new Map());
    const otherFees = await masterKnex(`${S}.extraction_course_fee_assignments`).where({ course_id: otherCourse.id });
    assert(otherFees.length === 1, "non-AgentCIS course: scraped fee written normally (guardrail is inert here)");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: agentcisJob.id }).delete();
    await masterKnex(`${S}.extraction_jobs`).where({ id: otherJob.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
