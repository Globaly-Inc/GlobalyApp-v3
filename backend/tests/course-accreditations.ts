/**
 * Accreditations reach staging from the AUTOMATIC pipeline.
 *
 * Reported on heraldcollege.edu.np: the IMBA and BIBM pages carry literal "accredited by" (CIM
 * logo → cim.co.uk) and "TU equivalency" (Tribhuvan University) sections, yet the job staged zero
 * accreditations — the main course prompt had no accreditations field and writeCourse wrote every
 * other child entity but not this one. The only path was the admin's per-course re-extract button.
 * Both paths now share stageCourseAccreditation.
 *
 * Needs the dev DB (same as the other staging tests). Run:
 *   node --import tsx tests/course-accreditations.ts
 */

import "dotenv/config";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function main() {
  const { courseExtractionPrompt } = await import("../src/modules/superadmin/data-extraction/lib/extraction-prompts.js");
  const { stageCourseAccreditation } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  // ── 1. The prompt asks for accreditations and knows the logo-only shape ────
  const prompt = courseExtractionPrompt("https://uni.example/imba", "#### accredited by ...");
  assert(/"accreditations": \[/.test(prompt), "course prompt carries an accreditations array");
  assert(/LOGO-ONLY/.test(prompt) && /LINK TARGET or the image filename/i.test(prompt),
    "prompt tells the model to read a logo-only accreditor from its link");
  assert(/equivalency body .* counts as an accreditation/i.test(prompt),
    "recognition/equivalency bodies count");
  assert(/goes in awarding_institution, never in accreditations/.test(prompt),
    "awarding body is routed to awarding_institution, not accreditations");
  assert(/the institution that AWARDS the qualification/.test(prompt),
    "awarding_institution finally has a description instead of a bare null");

  // ── 2. stageCourseAccreditation: find-or-create + idempotent linking ───────
  const [job] = await masterKnex(`${S}.extraction_jobs`).insert({
    institution_url: "https://probe-accred.invalid/", institution_name: "probe", status: "review",
  }).returning("id");
  const jobId = job.id as string;
  try {
    const [c] = await masterKnex(`${S}.extraction_courses`).insert({
      job_id: jobId, name: "Probe Course", verification_status: "ingested",
    }).returning("id");
    const courseId = c.id as string;

    // The live failure order: the full name arrives FIRST and carries NO website (a logo link the
    // model missed), then the bare abbreviation arrives WITH one. Name misses, domain has nothing
    // stored to match — the parenthesised abbreviation is the only bridge.
    assert(await stageCourseAccreditation(jobId, courseId, { name: "Probe Accreditor (PAX)" }) === true, "stages a named accreditation");
    assert(await stageCourseAccreditation(jobId, courseId, { name: "PAX", website: "https://www.pax.invalid/about" }) === true,
      "a bare abbreviation finds the body whose stored name carries it in parentheses");
    assert(await stageCourseAccreditation(jobId, courseId, { name: "probe accreditor (pax)" }) === true,
      "case-insensitive name finds the same body");
    // Domain identity: a third spelling sharing the (now backfilled) website domain.
    assert(await stageCourseAccreditation(jobId, courseId, { name: "The Probe Accreditation Board", website: "https://pax.invalid/" }) === true,
      "domain match accepts a differently-named duplicate");
    assert(await stageCourseAccreditation(jobId, courseId, { name: "  " }) === false, "nameless entry is refused");

    const bodies = await masterKnex(`${S}.extraction_accreditations`)
      .whereRaw("LOWER(name) = LOWER(?)", ["Probe Accreditor (PAX)"]);
    assert(bodies.length === 1, `one body row despite four stagings (got ${bodies.length})`);
    assert(bodies[0]?.website === "https://www.pax.invalid/about",
      "website backfilled onto the body staged without one, so later domain lookups can match");

    const links = await masterKnex(`${S}.extraction_course_accreditation_assignments`)
      .where({ course_id: courseId });
    assert(links.length === 1, `one assignment despite four stagings (got ${links.length})`);
    assert(links[0]?.job_id === jobId && links[0]?.extraction_accreditation_id === bodies[0]?.id,
      "assignment links the right body to the right job");
  } finally {
    const courseIds = (await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId }).select("id")).map((r: { id: string }) => r.id);
    await masterKnex(`${S}.extraction_course_accreditation_assignments`).whereIn("course_id", courseIds).delete();
    await masterKnex(`${S}.extraction_accreditations`).whereRaw("LOWER(name) = LOWER(?)", ["Probe Accreditor (PAX)"]).delete();
    await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId }).delete();
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
